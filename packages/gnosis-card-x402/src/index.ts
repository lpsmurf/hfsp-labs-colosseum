import './config.js'; // validates env on startup
import express from 'express';
import helmet from 'helmet';
import { noLogs } from './middleware/noLogs.js';
import { cardRouter } from './routes/card.js';
import { bridgeRouter } from './routes/bridge.js';
import { healthRouter } from './routes/health.js';
import { rpcRouter } from './routes/rpc.js';
import { safeRouter } from './routes/safe.js';
import { storeRouter } from './routes/store.js';
import { circlesRouter } from './routes/circles.js';
import { config } from './config.js';

const app = express();

// Security headers — helmet sets HSTS, CSP, X-Frame-Options, etc.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}));

// No request logging (privacy)
app.use(noLogs);

app.use(express.json({ limit: '64kb' }));

// Trust proxy headers from nginx
app.set('trust proxy', 1);

app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
app.use('/api/card/safe', safeRouter);
app.use('/api/card', cardRouter);
app.use('/api/bridge', bridgeRouter);
app.use('/api/rpc', rpcRouter);
app.use('/api/store', storeRouter);
app.use('/api/circles', circlesRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 500
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] unhandled error:', err instanceof Error ? err.message : String(err));
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(config.PORT);
app.listen(PORT, () => {
  console.log(`[gnosis-card] listening on :${PORT}`);
  console.log(`[gnosis-card] wallet: ${config.WALLET_PUBLIC_KEY}`);
});
