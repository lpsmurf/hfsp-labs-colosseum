// Legacy-gate unit tests isolate the V2 boundary. Its real SDK flow is covered
// by x402-common's prepaid tests using a deterministic facilitator.
jest.mock('@hfsp/x402-common', () => ({
  DEFAULT_FACILITATOR: 'https://example.invalid',
  createResourceServer: jest.fn(),
  gate: jest.fn(options => options),
  createPrepaidGate: () => async (_req, res) => {
    res.status(402).json({ error: 'Payment required' });
    return null;
  },
}));
