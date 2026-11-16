import { japanese, translate } from './i18n.js';

const $ = id => document.getElementById(id);
const text = (tag, content, className) => { const element = document.createElement(tag); element.textContent = content; if (className) element.className = className; return element; };
let report, traceReport, shutdownToken;
let language = 'en', scanning = false, tracing = false, stopped = false;
let scanState = { kind: 'idle' }, traceState = { kind: 'idle' };
try { language = document.cookie.match(/(?:^|;\s*)ipv6-detector-language=(en|ja)(?:;|$)/)?.[1] || localStorage.getItem('ipv6-detector-language') || 'en'; } catch {}
if (!['en', 'ja'].includes(language)) language = 'en';
const t = (key, parameters) => translate(key, language, parameters);
const value = item => item === null || item === undefined || item === '' ? t('Not available') : String(item).trim();
const date = timestamp => new Date(timestamp).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US');
const navigation = text('a', '⇄ Network paths'); navigation.href = '#paths'; document.querySelector('nav').append(navigation);

// Capture only the initial static text. Dynamic values are rendered explicitly below.
const staticBindings = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
  const node = walker.currentNode, original = node.data, trimmed = original.trim();
  let key = trimmed, prefix = '';
  if (!Object.hasOwn(japanese, key)) {
    const match = trimmed.match(/^([^\p{L}\p{N}]+)(.+)$/u);
    if (match) { prefix = match[1]; key = match[2]; }
  }
  if (Object.hasOwn(japanese, key)) staticBindings.push({ node, original, trimmed, prefix, key });
}

function renderControls() {
  $('scan').textContent = t(scanning ? 'Scanning…' : '↻ Run diagnostics');
  $('scan').disabled = scanning || stopped;
  $('trace').textContent = t(tracing ? 'Tracing…' : 'Trace IPv4 / IPv6');
  $('trace').disabled = tracing || stopped;
  $('quit').textContent = t(stopped ? 'App stopped' : 'Shut down app');
  $('export').textContent = t('↓ Export report');
  $('export').disabled = !report;
}
function renderMessages() {
  $('message').className = scanState.kind === 'error' ? 'error' : '';
  if (stopped) $('message').textContent = t('IPv6 Detector has stopped. You can close this tab. Double-click the portable executable to start again.');
  else if (scanState.kind === 'idle') $('message').textContent = t('Ready to inspect this device. A scan checks local settings and connects to Cloudflare over IPv4 and IPv6.');
  else if (scanState.kind === 'running') $('message').textContent = t('Reading Windows adapters and device specifications, checking DNS and testing IPv4 / IPv6 connections…');
  else if (scanState.kind === 'error') $('message').textContent = `${t('Scan failed.')} ${t(scanState.error)} ${scanState.detail || ''} ${report ? t('The dashboard still shows the previous scan.') : ''}`;
  else if (report) $('message').textContent = `${t('Scan complete. IPv4: {ipv4}. IPv6: {ipv6}.', { ipv4: t(report.connectivity.ipv4.success ? 'connected' : 'unsuccessful'), ipv6: t(report.connectivity.ipv6.success ? 'connected' : 'unsuccessful') })}${report.warnings.length ? ` ${t('Warnings:')} ${report.warnings.map(warning => t(warning)).join(' ')}` : ''}`;
  $('trace-message').textContent = traceState.kind === 'running' ? t('Tracing IPv4 and IPv6 to fixed Cloudflare targets. Up to 16 hops; allow about 40 seconds.') : traceState.kind === 'complete' ? t('Trace complete. Non-responsive hops remain unknown; no ISP fault or unnecessary hop is inferred.') : traceState.kind === 'error' ? `${t('Trace failed.')} ${t(traceState.error)} ${traceReport ? t('Previous trace remains visible.') : ''}` : '';
}
function setLanguage() {
  document.documentElement.lang = language;
  document.title = t('IPv6 Detector — Network intelligence');
  document.querySelector('nav').setAttribute('aria-label', t('Main navigation'));
  document.querySelector('.summary').setAttribute('aria-label', t('Summary'));
  $('language').value = language;
  for (const binding of staticBindings) {
    if (!binding.node.isConnected) continue;
    const offset = binding.original.indexOf(binding.trimmed);
    binding.node.data = binding.original.slice(0, offset) + binding.prefix + t(binding.key) + binding.original.slice(offset + binding.trimmed.length);
  }
  renderControls(); renderMessages();
  if (report) renderReport();
  if (traceReport) renderTraces();
}
$('language').addEventListener('change', () => {
  language = $('language').value === 'ja' ? 'ja' : 'en';
  try {
    localStorage.setItem('ipv6-detector-language', language);
    // A loopback port changes between launches; cookies retain this preference across ports.
    document.cookie = `ipv6-detector-language=${language}; Path=/; Max-Age=31536000; SameSite=Strict`;
  } catch {}
  setLanguage();
});
fetch('/api/app').then(response => response.json()).then(app => {
  if (app.portable) { shutdownToken = app.shutdownToken; $('quit').hidden = false; }
}).catch(() => {});
$('quit').addEventListener('click', async () => {
  $('quit').disabled = true;
  try {
    const response = await fetch('/api/shutdown', { method: 'POST', headers: { 'X-Detector-Token': shutdownToken } });
    if (!response.ok) throw new Error('Could not stop the local application.');
    stopped = true; renderMessages(); renderControls();
  } catch (error) { $('message').textContent = t(error.message); $('quit').disabled = false; }
});
function field(label, values) {
  const wrap = document.createElement('div'); wrap.append(text('div', t(label), 'field-label'));
  for (const item of values.length ? values : [t('Not configured')]) wrap.append(text('div', item, 'value'));
  return wrap;
}
function renderAdapters() {
  if (!report) return;
  const adapters = report.adapters.filter(adapter => !$('active-only').checked || adapter.status === 'Up');
  $('adapters').replaceChildren(); $('adapters').className = adapters.length ? '' : 'empty';
  if (!adapters.length) { $('adapters').textContent = t('No adapters match this filter.'); return; }
  for (const adapter of adapters) {
    const row = text('article', '', 'adapter'), heading = text('div', '', 'adapter-title'), left = document.createElement('div');
    const name = text('div', adapter.name, 'adapter-name');
    name.append(text('small', t(adapter.physical ? 'Physical adapter' : 'Virtual adapter')));
    left.append(name, text('p', `${value(adapter.description)}${adapter.networkName ? ` · ${adapter.networkName}` : ''}`));
    heading.append(left, text('span', t(adapter.status === 'Up' ? '● Connected' : adapter.status), `badge ${adapter.status === 'Up' ? '' : 'off'}`));
    const grid = text('div', '', 'adapter-grid');
    grid.append(field('IPv4 addresses', adapter.addresses.filter(ip => ip.family === 'IPv4').map(ip => `${ip.address}/${ip.prefix} · ${t(ip.state)}`)), field('IPv6 addresses', adapter.addresses.filter(ip => ip.family === 'IPv6').map(ip => `${ip.address}/${ip.prefix} · ${t(ip.scope)} · ${t(ip.state)}`)), field('Gateway', adapter.gateways.map(gateway => gateway.address)), field('DNS servers', adapter.dns), field('Link speed / MAC', [value(adapter.linkSpeed), value(adapter.mac)]), field('IPv6 binding', [t(adapter.ipv6Enabled === null ? 'Unknown' : adapter.ipv6Enabled ? 'Enabled' : 'Disabled')]));
    row.append(heading, grid); $('adapters').append(row);
  }
}
function checkDetail(check) {
  if (check.detail.startsWith('AAAA lookup did not succeed:')) return t('AAAA lookup did not succeed: {error}', { error: t(report.connectivity.dns.error) });
  if (check.detail.startsWith('IPv6 TLS test failed:')) return t('IPv6 TLS test failed: {error}. A failed target does not prove all IPv6 destinations are unavailable.', { error: t(report.connectivity.ipv6.error) });
  return t(check.detail);
}
function renderReport() {
  const { assessment, connectivity, system, adapters } = report;
  $('ipv6-status').textContent = t(assessment.status); $('ipv6-status').className = assessment.tone;
  $('ipv6-detail').textContent = t(connectivity.ipv6.success ? 'Public IPv6 TLS connection verified' : 'Review the readiness checklist below');
  $('adapter-count').textContent = String(adapters.filter(adapter => adapter.status === 'Up').length).padStart(2, '0');
  $('adapter-detail').textContent = t('{count} total adapters detected', { count: adapters.length });
  $('device-status').textContent = t(assessment.device);
  $('latency').textContent = connectivity.ipv6.success ? `${connectivity.ipv6.latencyMs} ms` : t('Unavailable');
  $('specs').replaceChildren();
  const specs = system ? [['Device', system.hostname], ['Operating system', `${system.os} (${system.version})`], ['Architecture', system.architecture], ['Processor', system.cpu], ['Logical processors', system.logicalProcessors], ['Memory', t('{total} GB system · {free} GB free', { total: (system.totalMemoryBytes / 2 ** 30).toFixed(1), free: (system.freeMemoryBytes / 2 ** 30).toFixed(1) })]] : [['Device specifications', t('Unavailable — see scan warnings')]];
  for (const [label, content] of specs) { const row = document.createElement('div'); row.append(text('dt', t(label)), text('dd', value(content))); $('specs').append(row); }
  $('checks').className = ''; $('checks').replaceChildren();
  for (const check of assessment.checks) {
    const row = text('div', '', 'check'), detail = document.createElement('div');
    detail.append(text('strong', t(check.name)), text('p', checkDetail(check)));
    const mark = text('span', check.status === 'pass' ? '✓' : check.status === 'unknown' ? '?' : '!', `check-mark ${check.status}`);
    mark.setAttribute('aria-label', t(check.status)); row.append(mark, detail); $('checks').append(row);
  }
  $('check-count').textContent = `${assessment.checks.filter(check => check.status === 'pass').length} / ${assessment.checks.length}`;
  $('recommendations').replaceChildren(...assessment.recommendations.map(item => text('li', t(item))));
  $('timestamp').textContent = t('Last scan {date} · {seconds}s', { date: date(report.scannedAt), seconds: (report.durationMs / 1000).toFixed(1) });
  renderAdapters(); renderRouting();
}
const findingMessages = {
  noDefault: '{family}: no active default route was confirmed. A more-specific route may still serve particular destinations.',
  multipleDefaults: '{family}: {count} active default routes. They can be valid backup or multi-network connections; they are not automatically redundant.',
  tiedDefaults: '{family}: multiple active default routes share the lowest total metric. Review if traffic uses an unexpected adapter; this alone does not establish a fault.',
  inactiveDefaults: '{count} default route(s) belong to disconnected interfaces. Review only if the associated connection is no longer needed.',
  virtualAdapters: '{count} active virtual adapter(s). VPN, Hyper-V and other applications may need them; presence alone is not a conflict.',
  splitRoutes: '{count} active /1 route(s) can override a default route for matching addresses, commonly for VPNs. Review the Windows-selected route for the test target.'
};
function table(headers, rows) {
  const wrap = text('div', '', 'table-wrap'), element = document.createElement('table'), head = document.createElement('thead'), heading = document.createElement('tr'), body = document.createElement('tbody');
  for (const header of headers) { const cell = text('th', t(header)); cell.scope = 'col'; heading.append(cell); }
  head.append(heading);
  for (const row of rows) { const line = document.createElement('tr'); for (const cell of row) line.append(text('td', cell)); body.append(line); }
  element.append(head, body); wrap.append(element); return wrap;
}
function renderRouting() {
  const routing = report.routing;
  if (!routing) return;
  $('routing').className = ''; $('routing').replaceChildren(text('h3', t('Windows-selected routes'), 'path-subheading'));
  const cards = text('div', '', 'route-cards');
  for (const selection of routing.selected) {
    const card = text('article', '', 'route-card'); card.append(text('strong', selection.target));
    if (!selection.found) card.append(text('p', t('No selected route was returned for this target.')));
    else {
      const grid = text('div', '', 'adapter-grid');
      grid.append(field('Interface', [value(selection.interfaceName)]), field('Destination prefix', [value(selection.destination)]), field('Next hop', [value(selection.nextHop)]), field('Source address', [value(selection.sourceAddress)])); card.append(grid);
    }
    cards.append(card);
  }
  $('routing').append(cards, text('h3', t('Default routes'), 'path-subheading'));
  if (!routing.defaults.length) $('routing').append(text('p', t('No default routes were reported.')));
  else $('routing').append(table(['Destination prefix', 'Interface', 'Next hop', 'Route + interface metric', 'Active'], routing.defaults.map(route => [route.destination, value(route.interfaceName), route.nextHop === '0.0.0.0' || route.nextHop === '::' ? t('On-link') : route.nextHop, `${value(route.routeMetric)} + ${value(route.interfaceMetric)} = ${value(route.totalMetric)}`, t(route.active === null ? 'Unknown' : route.active ? 'Active' : 'Inactive')])));
  $('routing').append(text('h3', t('Routing observations'), 'path-subheading'));
  for (const finding of routing.findings) $('routing').append(text('div', t(findingMessages[finding.code], finding), `observation ${finding.level}`));
  if (!routing.findings.length) $('routing').append(text('p', t('No additional routing observations.')));
}
function renderTraces() {
  $('traces').className = ''; $('traces').replaceChildren();
  const statuses = { reached: 'Destination reached', incomplete: 'Incomplete / response limited', timeout: 'Time limit reached', unavailable: 'No usable hop data' };
  for (const trace of traceReport.traces) {
    const heading = text('div', '', 'trace-heading');
    heading.append(text('strong', `IPv${trace.family} · ${trace.target}`), text('span', t(statuses[trace.status]), `badge ${trace.reached ? '' : 'off'}`));
    $('traces').append(heading, text('p', t('Observed {date} · up to {count} hops', { date: date(traceReport.tracedAt), count: trace.maxHops })));
    if (!trace.hops.length) $('traces').append(text('p', t('No hop replies were parsed. Check local routes and whether ICMP is permitted.')));
    else $('traces').append(table(['Hop', 'Responding address', 'Round-trip samples'], trace.hops.map(hop => [String(hop.number), hop.responded ? hop.addresses.join(', ') : t('No response / unknown'), [...hop.timesMs.map(time => `${time} ms`), ...Array(hop.unansweredProbes).fill('*')].join(' / ') || t('Unknown')])));
  }
  $('traces').append(text('p', t('Router / ISP ownership is not identified by this test.')));
}
$('scan').addEventListener('click', async () => {
  scanning = true; scanState = { kind: 'running' }; renderControls(); renderMessages();
  try {
    const response = await fetch('/api/scan', { signal: AbortSignal.timeout(55000) }), result = await response.json();
    if (!response.ok) { scanState = { kind: 'error', error: result.error, detail: result.detail }; return; }
    report = result; scanState = { kind: 'complete' }; renderReport();
  } catch (error) { scanState = { kind: 'error', error: error.message }; }
  finally { scanning = false; renderControls(); renderMessages(); }
});
$('trace').addEventListener('click', async () => {
  tracing = true; traceState = { kind: 'running' }; renderControls(); renderMessages();
  try {
    const response = await fetch('/api/trace', { signal: AbortSignal.timeout(45000) }), result = await response.json();
    if (!response.ok) throw new Error(result.error);
    traceReport = result; traceState = { kind: 'complete' }; renderTraces();
  } catch (error) { traceState = { kind: 'error', error: error.message }; }
  finally { tracing = false; renderControls(); renderMessages(); }
});
$('active-only').addEventListener('change', renderAdapters);
$('export').addEventListener('click', () => {
  if (!report) return;
  const data = { ...report, reportLanguage: language, pathTrace: traceReport || null, localized: { status: t(report.assessment.status), device: t(report.assessment.device), checks: report.assessment.checks.map(check => ({ name: t(check.name), status: t(check.status), detail: checkDetail(check) })), recommendations: report.assessment.recommendations.map(item => t(item)), routingObservations: (report.routing?.findings || []).map(finding => t(findingMessages[finding.code], finding)) } };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `ipv6-report-${report.scannedAt.replace(/[:.]/g, '-')}-${language}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
setLanguage();
