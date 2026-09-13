import { describe, it, expect } from 'vitest';
import { checkExposure } from '../src/static/exposure.js';

const scan = (content: string, path = 'src/routes/x.ts') => checkExposure({ path, content });

describe('STATIC-EXPOSE — upstream response passthrough', () => {
  it('rates an id lookup that proxies a supplier order HIGH with high confidence', () => {
    const [f, ...rest] = scan(`
      router.get('/orders/:id', async (req, res) => {
        const order = await getOrder(req.params.id);
        res.json(order);
      });`);
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ id: 'STATIC-EXPOSE-001', severity: 'HIGH', confidence: 'HIGH' });
  });

  it('catches property, shorthand and spread forms', () => {
    for (const sink of ['res.json({ ok: true, data: order })', 'res.json({ ok: true, order })', 'res.send({ ...order, ok: true })']) {
      const out = scan(`router.get('/o/:id', async (req, res) => { const order = await fetchOrder(req.params.id); ${sink}; });`);
      expect(out.map(f => f.id), sink).toEqual(['STATIC-EXPOSE-001']);
    }
  });

  it('is silenced by mapping through any function', () => {
    expect(scan(`router.get('/o/:id', async (req, res) => { const order = await getOrder(req.params.id); res.json({ data: pick(order) }); });`)).toEqual([]);
  });

  it('ignores public reference data on non-lookup routes', () => {
    expect(scan(`router.get('/catalog', async (req, res) => { const items = await getCatalog('us'); res.json(items); });`)).toEqual([]);
  });

  it('flags a private record on a non-lookup route as MEDIUM unless sensitive fields are nearby', () => {
    const plain = scan(`router.post('/buy', async (req, res) => { const payment = await getPaymentStatus(); res.json(payment); });`);
    expect(plain.map(f => [f.id, f.severity])).toEqual([['STATIC-EXPOSE-001', 'MEDIUM']]);
    const sensitive = scan(`// returns voucher_code\nrouter.post('/buy', async (req, res) => { const payment = await getPaymentStatus(); res.json(payment); });`);
    expect(sensitive.map(f => f.severity)).toEqual(['HIGH']);
  });

  it('flags a stored upstream payload echoed from a file with lookup routes (helper or inline)', () => {
    const out = scan(`
      const view = (job) => ({ status: job.stage, result: job?.result });
      router.get('/status/:id', async (req, res) => res.json(view(await load(req.params.id))));`);
    expect(out.map(f => f.id)).toEqual(['STATIC-EXPOSE-002']);
  });

  it('does not flag stored payloads in files without lookup routes, or test files', () => {
    expect(scan(`const v = { result: job.result }; router.post('/jobs', (req, res) => res.json({ ok: true }));`)).toEqual([]);
    expect(scan(`router.get('/o/:id', async (req, res) => { const o = await getOrder(); res.json(o); });`, 'src/o.test.ts')).toEqual([]);
  });
});
