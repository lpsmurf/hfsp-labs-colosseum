import { Router } from 'express';
import { listCharities, findCharity } from '../catalog.js';

export const charitiesRouter = Router();

// GET /charities?search=climate&category=environment&limit=20&offset=0
charitiesRouter.get('/', async (req, res) => {
  const search   = typeof req.query.search   === 'string' ? req.query.search   : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const limit    = Math.min(Number(req.query.limit  ?? 20), 100);
  const offset   = Number(req.query.offset ?? 0);

  try {
    const result = await listCharities({ search, category, limit, offset });
    res.json(result);
  } catch (err) {
    console.error('[charities] list error:', err);
    res.status(502).json({ error: 'Failed to fetch charity catalog from Endaoment' });
  }
});

// GET /charities/:slug — look up by slug, EIN, or Endaoment UUID
charitiesRouter.get('/:id', async (req, res) => {
  try {
    const charity = await findCharity(req.params.id);
    if (!charity) {
      res.status(404).json({ error: 'Charity not found — try searching by name, EIN, or Endaoment UUID' });
      return;
    }
    res.json(charity);
  } catch (err) {
    console.error('[charities] lookup error:', err);
    res.status(502).json({ error: 'Failed to look up charity' });
  }
});
