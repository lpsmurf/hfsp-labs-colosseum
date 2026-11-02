import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sensitiveFields, probeDataExposure } from '../src/dynamic/data-exposure.js';

describe('sensitiveFields', () => {
  it('finds non-empty goods and credentials at any depth', () => {
    expect(sensitiveFields({ status: 'completed', deliveries: [{ voucher_code: 'ABC', pin_serial: '123', brand: 'X' }] }))
      .toEqual(['$.deliveries[0].voucher_code', '$.deliveries[0].pin_serial']);
    expect(sensitiveFields({ auth: { apiKey: 'k', client_secret: 's' } })).toEqual(['$.auth.apiKey', '$.auth.client_secret']);
  });

  it('ignores empty values and schema-like documents that only name the field', () => {
    expect(sensitiveFields({ voucher_code: '', pin: null, properties: { voucher_code: { type: 'string' } } })).toEqual([]);
  });
});

describe('probeDataExposure', () => {
  let server: Server; let base = '';
  beforeAll(async () => {
    server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/leak') res.end(JSON.stringify({ ok: true, data: { deliveries: [{ voucher_code: 'SECRET-CODE' }] } }));
      else res.end(JSON.stringify({ ok: true, status: 'delivering' }));
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(r => server.close(() => r())));

  it('reports the exposed field path without the value', async () => {
    const findings = await probeDataExposure(`${base}/leak`);
    expect(findings.map(f => f.id)).toEqual(['DYN-EXPOSE-001', 'DYN-EXPOSE-001']);
    expect(findings[0].detail).toContain('$.data.deliveries[0].voucher_code');
    expect(JSON.stringify(findings)).not.toContain('SECRET-CODE');
  });

  it('is silent on a redacted status response', async () => {
    expect(await probeDataExposure(`${base}/status`)).toEqual([]);
  });
});
