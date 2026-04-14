/**
 * Vercel serverless proxy → piercalito VPS backend
 * All /api/v1/* requests are forwarded to the backend VPS.
 * Set VPS_HOST env var in Vercel project settings (default: 72.62.239.63)
 */
import https from 'https';

const VPS_HOST = process.env.VPS_HOST || '72.62.239.63';
const BACKEND_HOSTNAME = process.env.BACKEND_HOSTNAME || 'app.hfsp.cloud';

const agent = new https.Agent({ rejectUnauthorized: false });

export default async function handler(req, res) {
  // Extract original path — vercel passes it via x-original-url or we parse manually
  const originalUrl = req.headers['x-original-url'] || req.url || '';
  // Strip leading /api/proxy prefix to get the real VPS path
  // vercel.json rewrites /api/v1/:path* → /api/proxy?vpath=/api/v1/:path*
  const targetPath = req.query.vpath || originalUrl;

  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(req.query).filter(([k]) => k !== 'vpath'))
  ).toString();
  const fullPath = qs ? `${targetPath}?${qs}` : targetPath;

  const forwardHeaders = { ...req.headers };
  delete forwardHeaders['host'];
  delete forwardHeaders['content-length'];
  forwardHeaders['host'] = BACKEND_HOSTNAME;

  const body =
    req.method !== 'GET' && req.method !== 'HEAD' && req.body
      ? typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      : undefined;

  if (body) forwardHeaders['content-length'] = Buffer.byteLength(body).toString();

  try {
    const proxyRes = await new Promise((resolve, reject) => {
      const proxyReq = https.request(
        { hostname: VPS_HOST, port: 443, path: fullPath, method: req.method, headers: forwardHeaders, agent },
        resolve
      );
      proxyReq.on('error', reject);
      if (body) proxyReq.write(body);
      proxyReq.end();
    });

    res.status(proxyRes.statusCode);
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (!['transfer-encoding', 'connection'].includes(k.toLowerCase())) res.setHeader(k, v);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const chunks = [];
    for await (const chunk of proxyRes) chunks.push(chunk);
    res.end(Buffer.concat(chunks));
  } catch (err) {
    res.status(502).json({ error: 'Proxy error', detail: err.message });
  }
}
