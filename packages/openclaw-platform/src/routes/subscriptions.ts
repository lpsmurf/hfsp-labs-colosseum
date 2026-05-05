import { Router } from 'express';

// TODO (Kimi): implement all routes in this file
// See WORKLOG.md for full route specs

const router = Router();

router.get('/ping', (_req, res) => {
  res.json({ route: 'subscriptions', status: 'stub — implement me' });
});

export default router;
