import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scan } from './lib/diagnostics.mjs';
import { randomBytes } from 'node:crypto';
import { tracePaths } from './lib/paths.mjs';

const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/i18n.js': ['i18n.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
export function createDetectorServer({ scanDevice = scan, traceDevice = tracePaths, onShutdown } = {}) {
let pending;
let latest;
let pendingTrace;
let latestTrace;
const shutdownToken = onShutdown ? randomBytes(32).toString('hex') : null;
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  const port = server.address()?.port;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(403).end('Invalid host'); return; }
  if (req.url === '/api/shutdown' && onShutdown && req.method === 'POST') {
    if (req.headers['x-detector-token'] !== shutdownToken || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
      res.writeHead(403).end('Invalid shutdown request'); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ stopped: true }), () => {
      server.close(onShutdown);
      server.closeIdleConnections();
    });
    return;
  }
  if (req.method !== 'GET') { res.writeHead(405).end('Method not allowed'); return; }
  try {
    if (req.url === '/api/app') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ portable: Boolean(onShutdown), shutdownToken })); return;
    }
    if (req.url === '/api/trace') {
      if (!latestTrace || Date.now() - latestTrace.created > 10000) {
        pendingTrace ??= traceDevice().then(data => { latestTrace = { data, created: Date.now() }; return data; }).finally(() => { pendingTrace = null; });
        const data = await pendingTrace;
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
      } else res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(latestTrace.data));
      return;
    }
    if (req.url === '/api/scan') {
      if (!latest || Date.now() - latest.created > 5000) {
        pending ??= scanDevice().then(data => { latest = { data, created: Date.now() }; return data; }).finally(() => { pending = null; });
        const data = await pending;
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
      } else res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(latest.data));
      return;
    }
    const asset = assets[req.url];
    if (!asset) { res.writeHead(404).end('Not found'); return; }
    const body = await readFile(new URL(`./public/${asset[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` }).end(body);
  } catch (error) {
    console.error(error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'The scan could not complete. Confirm Windows networking commands are available and PowerShell scripts are allowed by your organization.', detail: error.message.split('\n')[0] }));
  }
});
return server;
}
const server = createDetectorServer();
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => console.log(`IPv6 Detector: http://127.0.0.1:${port}`));
  server.on('error', error => { console.error(`Unable to start: ${error.message}`); process.exitCode = 1; });
}
export { server };
