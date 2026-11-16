import { spawn } from 'node:child_process';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const temporary = await mkdtemp(join(tmpdir(), 'ipv6-portable-test-'));
let child;
try {
  const exe = join(temporary, 'IPv6-Detector.exe');
  await copyFile(fileURLToPath(new URL('../release/IPv6-Detector-Windows-x64/IPv6-Detector.exe', import.meta.url)), exe);
  const env = { ...process.env, PATH: join(process.env.SystemRoot || 'C:\\Windows', 'System32') };
  delete env.NODE_PATH; delete env.NODE_OPTIONS;
  child = spawn(exe, ['--no-browser'], { cwd: temporary, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let output = '';
  child.stderr.on('data', data => { output += data; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${output}`)), 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Exited before ready (${code}): ${output}`)); });
    child.stdout.on('data', data => {
      output += data;
      const found = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (found) { clearTimeout(timer); resolve(found[0]); }
    });
  });
  for (const path of ['/', '/app.js', '/style.css']) {
    const response = await fetch(url + path); assert.equal(response.status, 200); assert.ok((await response.text()).length > 100);
  }
  const response = await fetch(url + '/api/scan', { signal: AbortSignal.timeout(55000) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.system.hostname.toLowerCase(), hostname().toLowerCase());
  assert.ok(Array.isArray(result.adapters)); assert.equal(result.assessment.checks.length, 6);
  const info = await (await fetch(url + '/api/app')).json(); assert.equal(info.portable, true);
  const shutdown = await fetch(url + '/api/shutdown', { method: 'POST', headers: { 'X-Detector-Token': info.shutdownToken, Origin: url } });
  assert.equal(shutdown.status, 200); await shutdown.json();
  const timeout = setTimeout(() => child.kill(), 10000);
  const [code] = await exited; clearTimeout(timeout); assert.equal(code, 0);
  console.log(`PASS: standalone EXE in an isolated folder with Node.js absent from PATH; embedded assets, real Windows scan (${result.adapters.length} adapters), and clean shutdown verified.`);
} finally {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}); }
  await rm(temporary, { recursive: true, force: true });
}
