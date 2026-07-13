import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { openDb, initSchema, validateSession, getStats } from './db.js';
import { sessionHandler } from './x402.js';
import { startProxy } from './proxy.js';
import { registerOnSAP } from './sap.js';

const API_PORT   = parseInt(process.env.API_PORT   ?? '8792');
const PROXY_PORT = parseInt(process.env.PROXY_PORT ?? '8793');
const DB_PATH    = process.env.DATABASE_PATH ?? './data/vpn.db';
const WALLET     = process.env.WALLET_PUBLIC_KEY ?? '';
const PRIVATE_KEY_HEX = process.env.WALLET_PRIVATE_KEY_HEX ?? '';

async function main() {
  if (!WALLET) throw new Error('WALLET_PUBLIC_KEY is required');
  if (!PRIVATE_KEY_HEX) throw new Error('WALLET_PRIVATE_KEY_HEX is required');

  const db = openDb(DB_PATH);
  initSchema(db);

  // HTTP CONNECT proxy
  startProxy(PROXY_PORT, db);

  // REST API
  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    const stats = getStats(db);
    res.json({
      status: 'ok',
      wallet: WALLET,
      proxyPort: PROXY_PORT,
      sessions: stats,
    });
  });

  // GET /session?hours=1|6|24   — no X-Payment → 402; with X-Payment → create session
  // POST /session { hours }     — same, for agent calls
  const handler = sessionHandler(WALLET, PROXY_PORT, db);
  app.get('/session', handler);
  app.post('/session', handler);

  // Check an existing session
  app.get('/session/:token', (req: Request, res: Response) => {
    const session = validateSession(db, req.params.token);
    if (!session) {
      res.status(404).json({ valid: false, error: 'Session not found or expired' });
      return;
    }
    const remainingSecs = Math.max(0, (new Date(session.expires_at).getTime() - Date.now()) / 1000);
    res.json({
      valid: true,
      expiresAt: session.expires_at,
      remainingHours: parseFloat((remainingSecs / 3600).toFixed(2)),
      durationHours: session.duration_hours,
      bytesTransferred: session.bytes_transferred,
    });
  });

  app.listen(API_PORT, () => {
    console.log(`[vpn] API  :${API_PORT}`);
    console.log(`[vpn] Proxy :${PROXY_PORT}`);
    console.log(`[vpn] Wallet: ${WALLET}`);
    console.log(`[vpn] Tiers: 0.10 USDC/1h | 0.50 USDC/6h | 1.50 USDC/24h`);
  });

  // SAP registration (non-blocking)
  registerOnSAP(PRIVATE_KEY_HEX).catch(err => {
    console.warn('[sap] Registration error:', err instanceof Error ? err.message : err);
  });
}

main().catch(err => { console.error('[vpn] fatal:', err); process.exit(1); });
