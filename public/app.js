let report;
let shutdownToken;
const $ = id => document.getElementById(id);
const text = (tag, content, className) => { const el = document.createElement(tag); el.textContent = content; if (className) el.className = className; return el; };
const value = v => v === null || v === undefined || v === '' ? 'Not available' : String(v);
fetch('/api/app').then(response => response.json()).then(app => {
  if (app.portable) { shutdownToken = app.shutdownToken; $('quit').hidden = false; }
}).catch(() => {});
$('quit').addEventListener('click', async () => {
  $('quit').disabled = true;
  try {
    const response = await fetch('/api/shutdown', { method: 'POST', headers: { 'X-Detector-Token': shutdownToken } });
    if (!response.ok) throw new Error('Could not stop the local application.');
    $('scan').disabled = true;
    $('message').className = '';
    $('message').textContent = 'IPv6 Detector has stopped. You can close this tab. Double-click the portable executable to start again.';
    $('quit').textContent = 'App stopped';
  } catch (error) { $('message').textContent = error.message; $('quit').disabled = false; }
});
function field(label, values) {
  const wrap = document.createElement('div');
  wrap.append(text('div', label, 'field-label'));
  for (const item of values.length ? values : ['Not configured']) wrap.append(text('div', item, 'value'));
  return wrap;
}
function renderAdapters() {
  if (!report) return;
  const adapters = report.adapters.filter(a => !$('active-only').checked || a.status === 'Up');
  $('adapters').replaceChildren();
  $('adapters').className = adapters.length ? '' : 'empty';
  if (!adapters.length) { $('adapters').textContent = 'No adapters match this filter.'; return; }
  for (const adapter of adapters) {
    const row = text('article', '', 'adapter');
    const heading = text('div', '', 'adapter-title');
    const left = document.createElement('div');
    const name = text('div', adapter.name, 'adapter-name');
    name.append(text('small', adapter.physical ? 'Physical adapter' : 'Virtual adapter'));
    left.append(name, text('p', `${value(adapter.description)}${adapter.networkName ? ` · ${adapter.networkName}` : ''}`));
    heading.append(left, text('span', adapter.status === 'Up' ? '● Connected' : adapter.status, `badge ${adapter.status === 'Up' ? '' : 'off'}`));
    const grid = text('div', '', 'adapter-grid');
    grid.append(field('IPv4 addresses', adapter.addresses.filter(a => a.family === 'IPv4').map(a => `${a.address}/${a.prefix} · ${a.state}`)), field('IPv6 addresses', adapter.addresses.filter(a => a.family === 'IPv6').map(a => `${a.address}/${a.prefix} · ${a.scope} · ${a.state}`)), field('Gateway', adapter.gateways.map(g => g.address)), field('DNS servers', adapter.dns), field('Link speed / MAC', [value(adapter.linkSpeed), value(adapter.mac)]), field('IPv6 binding', [adapter.ipv6Enabled === null ? 'Unknown' : adapter.ipv6Enabled ? 'Enabled' : 'Disabled']));
    row.append(heading, grid); $('adapters').append(row);
  }
}
function render() {
  const { assessment, connectivity, system, adapters } = report;
  $('ipv6-status').textContent = assessment.status;
  $('ipv6-status').className = assessment.tone;
  $('ipv6-detail').textContent = connectivity.ipv6.success ? 'Public IPv6 TLS connection verified' : 'Review the readiness checklist below';
  $('adapter-count').textContent = String(adapters.filter(a => a.status === 'Up').length).padStart(2, '0');
  $('adapter-detail').textContent = `${adapters.length} total adapters detected`;
  $('device-status').textContent = assessment.device;
  $('latency').textContent = connectivity.ipv6.success ? `${connectivity.ipv6.latencyMs} ms` : 'Unavailable';
  $('specs').replaceChildren();
  const specs = system ? [['Device', system.hostname], ['Operating system', `${system.os} (${system.version})`], ['Architecture', system.architecture], ['Processor', system.cpu], ['Logical processors', system.logicalProcessors], ['Memory', `${(system.totalMemoryBytes / 2 ** 30).toFixed(1)} GB installed · ${(system.freeMemoryBytes / 2 ** 30).toFixed(1)} GB free`]] : [['Device specifications', 'Unavailable — see scan warnings']];
  for (const [label, content] of specs) { const row = document.createElement('div'); row.append(text('dt', label), text('dd', value(content))); $('specs').append(row); }
  $('checks').className = ''; $('checks').replaceChildren();
  for (const check of assessment.checks) {
    const row = text('div', '', 'check'); const detail = document.createElement('div');
    detail.append(text('strong', check.name), text('p', check.detail));
    const mark = text('span', check.status === 'pass' ? '✓' : check.status === 'unknown' ? '?' : '!', `check-mark ${check.status}`);
    mark.setAttribute('aria-label', check.status); row.append(mark, detail); $('checks').append(row);
  }
  $('check-count').textContent = `${assessment.checks.filter(c => c.status === 'pass').length} / ${assessment.checks.length}`;
  $('recommendations').replaceChildren(...assessment.recommendations.map(r => text('li', r)));
  $('timestamp').textContent = `Last scan ${new Date(report.scannedAt).toLocaleString()} · ${(report.durationMs / 1000).toFixed(1)}s`;
  renderAdapters();
}
$('scan').addEventListener('click', async () => {
  $('scan').disabled = true; $('scan').textContent = 'Scanning…'; $('message').className = '';
  $('message').textContent = 'Reading Windows adapters and device specifications, checking DNS and testing IPv4 / IPv6 connections…';
  try {
    const response = await fetch('/api/scan', { signal: AbortSignal.timeout(55000) });
    const result = await response.json();
    if (!response.ok) throw new Error(`${result.error} ${result.detail || ''}`);
    report = result; render(); $('export').disabled = false;
    $('message').textContent = `Scan complete. IPv4 test: ${report.connectivity.ipv4.success ? 'connected' : 'unsuccessful'}. IPv6 test: ${report.connectivity.ipv6.success ? 'connected' : 'unsuccessful'}.${report.warnings.length ? ` Warnings: ${report.warnings.join(' ')}` : ''}`;
  } catch (error) { $('message').className = 'error'; $('message').textContent = `Scan failed. ${error.message}${report ? ' The dashboard still shows the previous scan.' : ''}`; }
  finally { $('scan').disabled = false; $('scan').textContent = '↻ Run diagnostics'; }
});
$('active-only').addEventListener('change', renderAdapters);
$('export').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `ipv6-report-${report.scannedAt.replace(/[:.]/g, '-')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
