// Fixture: the same routes returning only allowlisted fields.
import { Router } from 'express';
import { getOrder, getCatalog } from './supplier.js';
const router = Router();

const publicFields = (o: any) => ({ status: o?.status, deliveries: (o?.deliveries ?? []).map((d: any) => ({ brand: d.brand_name, state: d.delivery_state })) });

router.get('/orders/:id', async (req, res) => {
  const data = await getOrder(req.params.id);
  res.json({ ok: true, data: publicFields(data) });
});

router.post('/redeem', async (req, res) => {
  const upstream = await fetch('https://supplier.example/v1/redemptions', { method: 'POST' });
  const redemption = await upstream.json();
  res.status(200).json({ status: redemption.status });
});

async function view(job: { stage: string; result?: unknown }) {
  return { status: job.stage, result: publicFields(job.result) };
}
router.get('/status/:orderId', async (req, res) => {
  res.json(await view(await load(req.params.orderId)));
});

// Public reference data passed through is fine.
router.get('/catalog', async (req, res) => {
  const catalog = await getCatalog(String(req.query.country));
  res.json(catalog);
});

declare function load(id: string): Promise<{ stage: string; result?: unknown }>;
export default router;
