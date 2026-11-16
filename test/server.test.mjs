import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createDetectorServer } from '../server.mjs';

async function start(options = {}) {
  const server = createDetectorServer(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function stop(server) { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); }

test('serves local assets on the actual assigned port and rejects missing files', async () => {
  const { server, url } = await start();
  try {
    for (const path of ['/', '/app.js', '/style.css', '/i18n.js', '/network-graph.js']) { const result = await fetch(url + path); assert.equal(result.status, 200); assert.ok((await result.text()).length > 0); }
    assert.equal((await fetch(url + '/missing')).status, 404);
    assert.equal((await fetch(url + '/', { method: 'POST' })).status, 405);
    const info = await (await fetch(url + '/api/app')).json();
    assert.equal(info.portable, false); assert.equal(info.shutdownToken, null);
  } finally { await stop(server); }
});
test('rejects untrusted Host headers', async () => {
  const { server, url } = await start();
  try {
    const status = await new Promise((resolve, reject) => {
      http.get(url, { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(status, 403);
  } finally { await stop(server); }
});
test('concurrent scans share collection and reuse the short cache', async () => {
  let calls = 0;
  const { server, url } = await start({ scanDevice: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 40)); return { result: 'real callback' }; } });
  try {
    const results = await Promise.all([fetch(url + '/api/scan'), fetch(url + '/api/scan')]);
    for (const result of results) assert.deepEqual(await result.json(), { result: 'real callback' });
    await fetch(url + '/api/scan'); assert.equal(calls, 1);
  } finally { await stop(server); }
});
test('failed scans can be retried', async () => {
  let calls = 0;
  const { server, url } = await start({ scanDevice: async () => { if (++calls === 1) throw new Error('Test collection failure'); return { recovered: true }; } });
  try {
    assert.equal((await fetch(url + '/api/scan')).status, 500);
    assert.deepEqual(await (await fetch(url + '/api/scan')).json(), { recovered: true });
  } finally { await stop(server); }
});
test('traces are independent from scans, shared concurrently and cached briefly', async () => {
  let calls = 0;
  const { server, url } = await start({ traceDevice: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 30)); return { traces: [] }; } });
  try {
    const responses = await Promise.all([fetch(url + '/api/trace'), fetch(url + '/api/trace')]);
    for (const response of responses) assert.deepEqual(await response.json(), { traces: [] });
    assert.equal((await fetch(url + '/api/trace')).status, 200); assert.equal(calls, 1);
  } finally { await stop(server); }
});
test('portable shutdown requires its session token and a matching origin', async () => {
  let stopped = false;
  const { server, url } = await start({ onShutdown: () => { stopped = true; } });
  try {
    const info = await (await fetch(url + '/api/app')).json();
    assert.equal(info.portable, true); assert.equal(info.shutdownToken.length, 64);
    assert.equal((await fetch(url + '/api/shutdown', { method: 'POST' })).status, 403);
    assert.equal((await fetch(url + '/api/shutdown', { method: 'POST', headers: { 'X-Detector-Token': info.shutdownToken, Origin: 'https://untrusted.example' } })).status, 403);
    const closed = once(server, 'close');
    const result = await fetch(url + '/api/shutdown', { method: 'POST', headers: { 'X-Detector-Token': info.shutdownToken, Origin: url } });
    assert.equal(result.status, 200); await result.json(); await closed;
    assert.equal(stopped, true);
  } finally { await stop(server); }
});
