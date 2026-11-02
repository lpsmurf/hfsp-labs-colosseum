/**
 * x402 payment gate — integration tests.
 *
 * These exercise the middleware AS MOUNTED, through a real Express app, rather
 * than by calling it directly with mock req/res. That distinction matters: the
 * gate once shipped mounted as `app.use(path, x402Middleware)` — the factory
 * instead of the middleware it returns — which made Express discard the handler
 * and never call next(), hanging every request. The existing unit tests called
 * `x402Middleware({...})` correctly and so could not see it.
 */

// Must be set before the middleware module is imported — PLATFORM_WALLET and
// NETWORK are captured at module load.
process.env.CLAWDROP_FEE_WALLET = 'ClawdropFeeWa11etAddressForTestsOnly11111111';
process.env.SOLANA_NETWORK = 'mainnet';

import express from 'express';
import request from 'supertest';

jest.mock('../integrations/helius', () => ({
  verifyPaymentTransaction: jest.fn(),
}));

import { verifyPaymentTransaction } from '../integrations/helius';
import { x402Middleware, __resetReplayCache } from '../middleware/x402';

const mockVerify = verifyPaymentTransaction as jest.MockedFunction<typeof verifyPaymentTransaction>;

const PAID = {
  verified: true,
  reason: 'ok',
  actual_amount_sol: 10,
  actual_recipient: process.env.CLAWDROP_FEE_WALLET,
  confirmation_status: 'finalized',
  block_time: Math.floor(Date.now() / 1000),
};

function buildApp() {
  const app = express();
  app.use(express.json());
  // Mounted exactly as server/api.ts does it.
  const gate = x402Middleware();
  app.use('/api/transfer', gate);
  app.post('/api/transfer', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('x402 gate (mounted)', () => {
  beforeEach(() => {
    __resetReplayCache();
    mockVerify.mockReset();
  });

  it('responds instead of hanging when no payment is supplied', async () => {
    const res = await request(buildApp())
      .post('/api/transfer')
      .send({ wallet_address: 'test' })
      .timeout(2000);

    expect(res.status).toBe(402);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  // The regression test for the gate that accepted any non-empty header.
  it('rejects a payment proof that does not verify on-chain', async () => {
    mockVerify.mockResolvedValue({ verified: false, reason: 'Transaction not found on chain' });

    const res = await request(buildApp())
      .post('/api/transfer')
      .set('X-Payment', 'hello')
      .send({ wallet_address: 'test' });

    expect(res.status).toBe(402);
    expect(res.body.error).toContain('Transaction not found');
  });

  it('rejects a proof paying the wrong recipient', async () => {
    mockVerify.mockResolvedValue({
      verified: false,
      reason: 'Wrong recipient: expected X, got Y',
    });

    const res = await request(buildApp())
      .post('/api/transfer')
      .set('X-Payment', 'sig_wrong_recipient')
      .send({ wallet_address: 'test' });

    expect(res.status).toBe(402);
  });

  it('admits a verified, fresh payment', async () => {
    mockVerify.mockResolvedValue(PAID);

    const res = await request(buildApp())
      .post('/api/transfer')
      .set('X-Payment', 'sig_good')
      .send({ wallet_address: 'test' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // The gate must verify against the fee it just calculated, not against nothing.
    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({
        tx_hash: 'sig_good',
        expected_recipient: process.env.CLAWDROP_FEE_WALLET,
        min_amount_sol: expect.any(Number),
      }),
    );
  });

  it('rejects the same proof on a second request (replay)', async () => {
    mockVerify.mockResolvedValue(PAID);
    const app = buildApp();

    const first = await request(app).post('/api/transfer').set('X-Payment', 'sig_replay').send({});
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/transfer').set('X-Payment', 'sig_replay').send({});
    expect(second.status).toBe(402);
    expect(second.body.error).toContain('already used');
  });

  it('rejects a confirmed but stale payment', async () => {
    mockVerify.mockResolvedValue({
      ...PAID,
      block_time: Math.floor(Date.now() / 1000) - 3600,
    });

    const res = await request(buildApp())
      .post('/api/transfer')
      .set('X-Payment', 'sig_stale')
      .send({});

    expect(res.status).toBe(402);
    expect(res.body.error).toContain('expired');
  });

  it('lets a rejected proof be retried after a transient failure', async () => {
    const app = buildApp();
    mockVerify.mockResolvedValueOnce({ verified: false, reason: 'RPC error: timeout' });
    mockVerify.mockResolvedValueOnce(PAID);

    const first = await request(app).post('/api/transfer').set('X-Payment', 'sig_retry').send({});
    expect(first.status).toBe(402);

    const second = await request(app).post('/api/transfer').set('X-Payment', 'sig_retry').send({});
    expect(second.status).toBe(200);
  });
});
