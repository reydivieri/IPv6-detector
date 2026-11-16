import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import { isSea } from 'node:sea';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);
async function collectInventory() {
  let directory;
  try {
    let script = fileURLToPath(new URL('../scripts/collect.ps1', import.meta.url));
    if (isSea()) {
      directory = await mkdtemp(join(tmpdir(), 'ipv6-detector-'));
      const source = await readFile(script);
      script = join(directory, 'collect.ps1');
      await writeFile(script, source, { flag: 'wx' });
    }
    const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    return await exec(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], { timeout: 45000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
export function addressScope(address) {
  if (net.isIP(address?.split('%')[0]) !== 6) return 'IPv4';
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::1') return 'Loopback';
  if (/^fe[89ab]/.test(normalized)) return 'Link-local';
  if (/^f[cd]/.test(normalized)) return 'Private (ULA)';
  if (/^[23]/.test(normalized)) return 'Global';
  return 'Other IPv6';
}

function probe(family) {
  const host = family === 6 ? '2606:4700:4700::1111' : '1.1.1.1';
  return new Promise(resolve => {
    const started = performance.now();
    let done = false;
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({ family, target: host, port: 443, ...result });
    };
    const socket = tls.connect({ host, port: 443, family, servername: 'one.one.one.one', rejectUnauthorized: true });
    const timer = setTimeout(() => finish({ success: false, error: 'Connection timed out' }), 5000);
    socket.once('secureConnect', () => finish({ success: true, latencyMs: Math.round(performance.now() - started) }));
    socket.once('error', error => finish({ success: false, error: error.code || error.message }));
  });
}

async function probeDNS() {
  const resolver = new dns.promises.Resolver({ timeout: 2500, tries: 1 });
  let timer;
  try {
    const records = await Promise.race([
      resolver.resolve6('one.one.one.one'),
      new Promise((_, reject) => { timer = setTimeout(() => { resolver.cancel(); reject(new Error('DNS timed out')); }, 4000); })
    ]);
    return { success: records.length > 0, records, target: 'one.one.one.one' };
  } catch (error) { return { success: false, records: [], error: error.code || error.message, target: 'one.one.one.one' }; }
  finally { clearTimeout(timer); }
}

export function assess(data, connectivity) {
  const active = data.adapters.filter(a => a.status === 'Up');
  const enabled = active.some(a => a.ipv6Enabled === true);
  const usable = a => a.family === 'IPv6' && a.state === 'Preferred';
  const global = active.some(a => a.addresses.some(ip => usable(ip) && addressScope(ip.address) === 'Global'));
  const local = active.some(a => a.addresses.some(usable));
  const route = active.some(a => a.gateways.some(g => g.family === 'IPv6'));
  const checks = [
    { name: 'IPv6 adapter binding', status: enabled ? 'pass' : active.some(a => a.ipv6Enabled === null) ? 'unknown' : 'warn', detail: enabled ? 'IPv6 is enabled on an active adapter.' : 'No enabled IPv6 binding was confirmed on an active adapter.' },
    { name: 'Local IPv6 address', status: local ? 'pass' : 'warn', detail: local ? 'An active adapter has a preferred IPv6 address.' : 'No preferred IPv6 address was found.' },
    { name: 'Global IPv6 address', status: global ? 'pass' : 'warn', detail: global ? 'A global address is configured. Reachability still requires a connection test.' : 'No preferred global IPv6 address was found; link-local and private addresses alone do not confirm public connectivity.' },
    { name: 'IPv6 default route', status: route ? 'pass' : 'warn', detail: route ? 'An active adapter has an IPv6 default route.' : 'No IPv6 default route was found on an active adapter.' },
    { name: 'IPv6 DNS records', status: connectivity.dns.success ? 'pass' : 'warn', detail: connectivity.dns.success ? 'The configured resolver returned AAAA records. DNS can use IPv4 or IPv6.' : `AAAA lookup did not succeed: ${connectivity.dns.error}` },
    { name: 'Public IPv6 connection', status: connectivity.ipv6.success ? 'pass' : 'warn', detail: connectivity.ipv6.success ? 'A verified TLS connection to Cloudflare succeeded over IPv6.' : `IPv6 TLS test failed: ${connectivity.ipv6.error}. A failed target does not prove all IPv6 destinations are unavailable.` }
  ];
  return {
    status: connectivity.ipv6.success ? 'IPv6 connected' : enabled || local ? 'IPv6 needs attention' : 'IPv6 not confirmed',
    tone: connectivity.ipv6.success ? 'pass' : 'warn',
    device: enabled || local ? 'IPv6 support detected' : 'IPv6 support not confirmed',
    checks,
    recommendations: [
      ...(!active.length ? ['Connect a network adapter, then run the scan again.'] : []),
      ...(!enabled ? ['Check the IPv6 binding in your active adapter properties. Unknown binding results may require checking Windows permissions.'] : []),
      ...(!global || !route ? ['Check whether your router and ISP provide IPv6 addressing and a default route. A VPN can change the available routes.'] : []),
      ...(!connectivity.ipv6.success ? ['Check router, VPN and firewall policies, then test another IPv6 destination to confirm the result.'] : []),
      ...(!connectivity.dns.success ? ['Check your DNS configuration and whether the configured resolver can return AAAA records.'] : []),
      'CPU and RAM are informational; IPv6 readiness depends on the operating system, adapter configuration and network path. No hardware upgrade is prescribed by this scan.'
    ]
  };
}

export async function scan() {
  if (process.platform !== 'win32') throw new Error('This version requires Windows and the Windows NetTCPIP PowerShell module.');
  const started = Date.now();
  const [inventory, ipv4, ipv6, dnsResult] = await Promise.all([
    collectInventory(),
    probe(4), probe(6), probeDNS()
  ]);
  const data = JSON.parse(inventory.stdout.replace(/^\uFEFF/, '').trim());
  for (const adapter of data.adapters) for (const ip of adapter.addresses) ip.scope = addressScope(ip.address);
  const connectivity = { ipv4, ipv6, dns: dnsResult };
  return { ...data, connectivity, assessment: assess(data, connectivity), scannedAt: new Date().toISOString(), durationMs: Date.now() - started };
}
