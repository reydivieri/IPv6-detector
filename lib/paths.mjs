import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import net from 'node:net';

const exec = promisify(execFile);
export const TRACE_TARGETS = [{ family: 4, target: '1.1.1.1' }, { family: 6, target: '2606:4700:4700::1111' }];
export const MAX_HOPS = 16;
export function parseTrace(output, target) {
  const hops = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match) continue;
    const number = Number(match[1]);
    if (number < 1 || number > MAX_HOPS) continue;
    const addresses = [...new Set(match[2].split(/\s+/).map(token => token.replace(/^\[|\]$/g, '')).filter(token => net.isIP(token.split('%')[0])))];
    const times = [...match[2].matchAll(/(<\s*\d+|\d+)\s*(?:ms|ミリ秒)/g)].map(value => value[1].replace(/\s/g, ''));
    hops.push({ number, addresses, timesMs: times, responded: addresses.length > 0, unansweredProbes: (match[2].match(/\*/g) || []).length });
  }
  return { hops, reached: hops.some(hop => hop.addresses.some(address => address.split('%')[0].toLowerCase() === target.toLowerCase())) };
}

async function traceTarget({ family, target }) {
  const started = Date.now();
  let output = '', error;
  try {
    const result = await exec(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tracert.exe'), ['-d', `-${family}`, '-h', String(MAX_HOPS), '-w', '600', target], { timeout: 40000, maxBuffer: 1024 * 1024, windowsHide: true });
    output = result.stdout;
  } catch (failure) {
    output = failure.stdout || '';
    error = failure.killed ? 'TRACE_TIMEOUT' : typeof failure.code === 'string' ? failure.code : 'TRACE_INCOMPLETE';
  }
  const result = parseTrace(output, target);
  return { family, target, ...result, status: result.reached ? 'reached' : error === 'TRACE_TIMEOUT' ? 'timeout' : result.hops.length ? 'incomplete' : 'unavailable', error: error || null, maxHops: MAX_HOPS, durationMs: Date.now() - started };
}
export async function tracePaths() {
  if (process.platform !== 'win32') throw new Error('Traceroute requires Windows.');
  const traces = await Promise.all(TRACE_TARGETS.map(traceTarget));
  return { traces, tracedAt: new Date().toISOString() };
}

export function analyzeRoutes(data) {
  const routes = data.routeTable || [];
  const defaults = routes.filter(route => ['0.0.0.0/0', '::/0'].includes(route.destination)).map(route => ({
    ...route, totalMetric: Number.isFinite(route.interfaceMetric) && Number.isFinite(route.routeMetric) ? route.interfaceMetric + route.routeMetric : null
  }));
  const findings = [];
  for (const family of ['IPv4', 'IPv6']) {
    const active = defaults.filter(route => route.family === family && route.active === true);
    if (active.length === 0) findings.push({ code: 'noDefault', level: 'warn', family, count: 0 });
    if (active.length > 1) {
      const known = active.filter(route => route.totalMetric !== null);
      const lowest = Math.min(...known.map(route => route.totalMetric));
      const tied = known.filter(route => route.totalMetric === lowest).length > 1;
      findings.push({ code: tied ? 'tiedDefaults' : 'multipleDefaults', level: tied ? 'warn' : 'info', family, count: active.length });
    }
  }
  const inactive = defaults.filter(route => route.active === false);
  if (inactive.length) findings.push({ code: 'inactiveDefaults', level: 'info', count: inactive.length });
  const virtual = data.adapters.filter(adapter => adapter.status === 'Up' && !adapter.physical);
  if (virtual.length) findings.push({ code: 'virtualAdapters', level: 'info', count: virtual.length });
  const split = routes.filter(route => route.active === true && ['0.0.0.0/1', '128.0.0.0/1', '::/1', '8000::/1'].includes(route.destination));
  if (split.length) findings.push({ code: 'splitRoutes', level: 'info', count: split.length });
  return { defaults, selected: data.selectedRoutes || [], findings };
}
