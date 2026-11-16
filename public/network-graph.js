import { translate } from './i18n.js';

const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
const colors = { observed: ['#eaf6f1', '#087f69'], configured: ['#eef4fc', '#3d6ba5'], unknown: ['#f3f5f7', '#82909e'] };

export function lowestRTT(samples = []) {
  return samples.reduce((lowest, sample) => {
    const match = String(sample).match(/^(<)?(\d+(?:\.\d+)?)$/);
    if (!match) return lowest;
    const result = { value: Number(match[2]), label: `${match[1] || ''}${match[2]}` };
    if (!Number.isFinite(result.value)) return lowest;
    return !lowest || result.value < lowest.value || (result.value === lowest.value && match[1]) ? result : lowest;
  }, null);
}

// Wrapping leaves room for Japanese glyphs and long IPv6 addresses in standalone exports.
function wrap(value, limit = 58) {
  const lines = []; let line = '', length = 0;
  for (const character of String(value ?? '')) {
    const weight = character.codePointAt(0) > 255 ? 2 : 1;
    if (length + weight > limit) { lines.push(line); line = ''; length = 0; }
    line += character; length += weight;
  }
  if (line) lines.push(line);
  return lines;
}

export function networkGraphModel(report, traceReport, language = 'en') {
  const t = (key, parameters) => translate(key, language, parameters);
  return [4, 6].map(family => {
    const target = family === 4 ? '1.1.1.1' : '2606:4700:4700::1111';
    const selection = report?.routing?.selected?.find(route => route.target === target);
    const defaults = (report?.routing?.defaults || []).filter(route => route.family === `IPv${family}`);
    const trace = traceReport?.traces?.find(path => path.family === family);
    const context = [{ state: selection?.found ? 'configured' : 'unknown', title: t('Windows-selected route'), lines: selection?.found ? [
      `${t('Interface')}: ${selection.interfaceName || t('Unknown')}`,
      `${t('Source address')}: ${selection.sourceAddress || t('Unknown')}`,
      `${t('Destination prefix')}: ${selection.destination}`,
      `${t('Next hop')}: ${selection.nextHop === '::' || selection.nextHop === '0.0.0.0' ? t('On-link') : selection.nextHop}`
    ] : [t(report ? 'No selected route was returned for this target.' : 'Run diagnostics to inspect local routing.')] }];
    for (const route of defaults) {
      const selected = selection?.found && selection.destination === route.destination && selection.interfaceId === route.interfaceId && selection.nextHop === route.nextHop;
      if (selected) continue;
      context.push({ state: 'configured', title: t('Other default route — review only'), lines: [
        `${route.interfaceName} · ${t(route.active === true ? 'Active' : route.active === false ? 'Inactive' : 'Unknown')}`,
        `${t('Next hop')}: ${route.nextHop}`,
        `${t('Route + interface metric')}: ${route.routeMetric ?? '?'} + ${route.interfaceMetric ?? '?'} = ${route.totalMetric ?? '?'}`
      ] });
    }
    const nodes = [{ state: 'configured', title: t('This device · trace origin'), lines: [t('The trace starts on this device.')] }];
    if (!trace?.hops?.length) nodes.push({ state: 'unknown', title: t(trace ? 'No usable hop data' : 'No trace yet.'), lines: [t(trace ? 'No response / unknown' : 'Run traceroute to observe upstream hops.')] });
    for (const hop of trace?.hops || []) {
      // Only the actual response address can identify a reply from the target.
      const destination = hop.addresses.some(address => address.split('%')[0].toLowerCase() === target.toLowerCase());
      nodes.push({ state: hop.responded ? 'observed' : 'unknown', title: `${t('Hop')} ${hop.number}${destination ? ` · ${t('Destination reached')}` : ''}`, lines: hop.addresses.length ? hop.addresses : [t('No response / unknown')], rtt: lowestRTT(hop.timesMs) });
    }
    if (!trace?.hops?.some(hop => hop.addresses.some(address => address.split('%')[0].toLowerCase() === target.toLowerCase()))) {
      nodes.push({ state: 'unknown', title: t(trace ? 'Destination not confirmed by this trace' : 'Destination not traced'), lines: [target] });
    }
    return { family, target, context, nodes };
  });
}

export function createNetworkDiagram(report, traceReport, language = 'en') {
  language = language === 'ja' ? 'ja' : 'en';
  const t = (key, parameters) => translate(key, language, parameters);
  const lanes = networkGraphModel(report, traceReport, language);
  const maxRTT = Math.max(1, ...lanes.flatMap(lane => lane.nodes.map(node => node.rtt?.value || 0)));
  const nodeLines = node => node.lines.flatMap(line => wrap(line));
  const nodeTitles = node => wrap(node.title, 52);
  const nodeHeight = node => 36 + nodeTitles(node).length * 18 + nodeLines(node).length * 16 + (node.rtt ? 29 : 0);
  const contextsHeight = Math.max(...lanes.map(lane => lane.context.reduce((height, node) => height + nodeHeight(node) + 12, 0)));
  const contextTop = 218, traceHeading = contextTop + contextsHeight + 26, traceTop = traceHeading + 30;
  const traceHeight = Math.max(...lanes.map(lane => lane.nodes.reduce((height, node) => height + nodeHeight(node) + 24, 0)));
  const notes = [
    t('Arrows show probe order, not physical cables or the ISP-to-device return path.'),
    t('Unknown replies and alternative routes do not prove a broken or unnecessary path.'),
    t('Bars show the lowest returned RTT per hop, not per-link latency. <1 is an upper bound; missing replies have no bar.'),
    t('Local route and trace snapshots can differ in time. Hop ownership is not verified.')
  ].flatMap(line => wrap(line, 144));
  const notesTop = traceTop + traceHeight + 12, height = notesTop + notes.length * 18 + 30, width = 1100;
  const parts = [];
  const label = (x, y, content, size = 12, color = '#435363', bold = false) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}"${bold ? ' font-weight="600"' : ''}>${escapeXML(content)}</text>`;
  const timestamp = input => input ? new Date(input).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US') : t('Not available');
  function node(x, y, width, data) {
    const [background, border] = colors[data.state], h = nodeHeight(data);
    parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${h}" rx="9" fill="${background}" stroke="${border}"${data.state === 'unknown' ? ' stroke-dasharray="5 4"' : ''}/>`);
    let baseline = y + 24;
    for (const title of nodeTitles(data)) { parts.push(label(x + 16, baseline, title, 13, border, true)); baseline += 18; }
    baseline += 2;
    for (const line of nodeLines(data)) { parts.push(label(x + 16, baseline, line, 11)); baseline += 16; }
    if (data.rtt) {
      parts.push(`<rect x="${x + 16}" y="${baseline + 1}" width="150" height="7" rx="3" fill="#d7e4df"/>`, `<rect x="${x + 16}" y="${baseline + 1}" width="${(data.rtt.value / maxRTT * 150).toFixed(2)}" height="7" rx="3" fill="#087f69"/>`, label(x + 178, baseline + 8, t('Lowest RTT: {value} ms', { value: data.rtt.label }), 10));
    }
    return h;
  }
  parts.push(label(28, 38, t('Network path diagram'), 24, '#1e293b', true), label(28, 63, t('IPv4 and IPv6 · local configuration and observed outward hops'), 13));
  parts.push(label(28, 91, `${t('Local route snapshot')}: ${timestamp(report?.scannedAt)}`, 11), label(28, 110, `${t('Traceroute snapshot')}: ${timestamp(traceReport?.tracedAt)}`, 11));
  for (const [index, [state, title]] of [['configured', 'Configured / local context'], ['observed', 'Responding hop'], ['unknown', 'Unknown / not confirmed']].entries()) {
    const x = 28 + index * 350;
    parts.push(`<circle cx="${x + 5}" cy="140" r="5" fill="${colors[state][1]}"/>`, label(x + 18, 144, t(title), 11));
  }
  for (const [index, lane] of lanes.entries()) {
    const x = 28 + index * 544;
    parts.push(label(x, 183, `IPv${lane.family} · ${lane.target}`, 15, '#1e293b', true), label(x, 204, t('Local route snapshot'), 12, '#3d6ba5', true));
    let y = contextTop;
    for (const data of lane.context) y += node(x, y, 500, data) + 12;
    parts.push(label(x, traceHeading, t('Observed traceroute · outward'), 13, '#1e293b', true));
    y = traceTop; let previous;
    for (const data of lane.nodes) {
      const center = y + 22;
      if (previous !== undefined) parts.push(`<line x1="${x + 9}" y1="${previous + 8}" x2="${x + 9}" y2="${center - 11}" stroke="#aebdc6" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#network-arrow)"/>`);
      parts.push(`<circle cx="${x + 9}" cy="${center}" r="6" fill="${colors[data.state][1]}"/>`);
      y += node(x + 28, y, 472, data) + 24; previous = center;
    }
  }
  notes.forEach((line, index) => parts.push(label(28, notesTop + index * 18, line, 10, '#637684')));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" lang="${language}" role="img" aria-labelledby="network-title network-description" font-family="Segoe UI, Yu Gothic, Meiryo, Arial, sans-serif"><title id="network-title">${escapeXML(t('Network path diagram'))}</title><desc id="network-description">${escapeXML(notes.join(' '))}</desc><defs><marker id="network-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#aebdc6"/></marker></defs><rect width="${width}" height="${height}" fill="#fff"/>${parts.join('')}</svg>`;
  return { svg, width, height };
}
