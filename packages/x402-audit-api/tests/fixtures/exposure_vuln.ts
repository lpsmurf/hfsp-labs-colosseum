// Fixture: supplier order data leaks through lookup and status routes.
import { Router } from 'express';
import { getOrder } from './supplier.js';
const router = Router();

// EXPOSE-001: supplier order proxied by id (shorthand property).
router.get('/orders/:id', async (req, res) => {
  const data = await getOrder(req.params.id);
  res.json({ ok: true, data });
});

// EXPOSE-001: fetched straight through, no lookup id but a private record.
router.post('/redeem', async (req, res) => {
  const upstream = await fetch('https://supplier.example/v1/redemptions', { method: 'POST' });
  const redemption = await upstream.json();
  res.status(200).json(redemption);
});

// EXPOSE-002: stored supplier payload echoed from a status view.
async function view(job: { stage: string; result?: unknown }) {
  return { status: job.stage, result: job.result };
}
router.get('/status/:orderId', async (req, res) => {
  res.json(await view(await load(req.params.orderId)));
});

declare function load(id: string): Promise<{ stage: string; result?: unknown }>;
// voucher_code and pin_serial arrive in supplier deliveries.
export default router;
