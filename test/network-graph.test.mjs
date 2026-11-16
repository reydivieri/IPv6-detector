import test from 'node:test';
import assert from 'node:assert/strict';
import { networkGraphModel, createNetworkDiagram, lowestRTT } from '../public/network-graph.js';

const report = { scannedAt: '2026-11-17T00:00:00Z', routing: {
  selected: [{ target: '1.1.1.1', found: true, interfaceId: 1, interfaceName: 'Wi-Fi', destination: '0.0.0.0/0', nextHop: '192.0.2.1', sourceAddress: '192.0.2.10' }],
  defaults: [{ family: 'IPv4', interfaceId: 1, interfaceName: 'Wi-Fi', destination: '0.0.0.0/0', nextHop: '192.0.2.1' }, { family: 'IPv4', interfaceId: 2, interfaceName: 'VPN', destination: '0.0.0.0/0', nextHop: '198.51.100.1', active: true, routeMetric: 10, interfaceMetric: 20, totalMetric: 30 }]
} };
const trace = { tracedAt: '2026-11-17T00:01:00Z', traces: [{ family: 4, reached: true, hops: [
  { number: 1, responded: true, addresses: ['192.0.2.1'], timesMs: ['<1', '2'] },
  { number: 2, responded: false, addresses: [], timesMs: [] },
  { number: 3, responded: true, addresses: ['1.1.1.1'], timesMs: ['10', '11'] }
] }] };
test('RTT bars preserve upper bounds and do not invent a zero for unanswered hops', () => {
  assert.equal(lowestRTT([]), null);
  assert.deepEqual(lowestRTT(['<1', '8', '3']), { value: 1, label: '<1' });
  assert.deepEqual(lowestRTT(['0', '1']), { value: 0, label: '0' });
  assert.equal(lowestRTT(['*', 'unknown', '-1']), null);
});
test('keeps configured routes separate from observed hops, including a silent hop', () => {
  const [ipv4] = networkGraphModel(report, trace);
  assert.equal(ipv4.context.length, 2); // Selected route + the other default, without duplicating the selected default.
  assert.equal(ipv4.nodes.length, 4); // Trace origin + exactly three observed TTL steps.
  assert.equal(ipv4.nodes[2].state, 'unknown'); assert.equal(ipv4.nodes[2].rtt, null);
  assert.equal(ipv4.nodes[3].title, 'Hop 3 · Destination reached');
  assert.ok(!ipv4.nodes.some(node => node.lines.includes('198.51.100.1')));
});
test('successful TLS or a reached flag alone cannot create a traceroute destination reply', () => {
  const misleading = { traces: [{ family: 4, reached: true, hops: [{ number: 1, responded: true, addresses: ['192.0.2.1'], timesMs: ['1'] }] }] };
  const [ipv4] = networkGraphModel(report, misleading);
  assert.equal(ipv4.nodes.at(-1).state, 'unknown');
  assert.equal(ipv4.nodes.at(-1).title, 'Destination not confirmed by this trace');
  assert.equal(networkGraphModel(report, null)[0].nodes.at(-1).title, 'Destination not traced');
});
test('trace-only data does not imply a local inventory snapshot was collected', () => {
  const [ipv4, ipv6] = networkGraphModel(null, trace);
  assert.equal(ipv4.context[0].state, 'unknown');
  assert.equal(ipv6.nodes.at(-1).state, 'unknown');
  assert.equal(ipv4.nodes[3].state, 'observed');
});
test('untrusted adapter and hop text cannot insert active SVG markup', () => {
  const data = structuredClone(report);
  data.routing.selected[0].interfaceName = '"><script>alert(1)</script>&';
  const { svg } = createNetworkDiagram(data, trace);
  assert.ok(svg.includes('&lt;script&gt;')); assert.ok(svg.includes('&amp;'));
  assert.ok(!/<script|foreignObject|<image|\sonload=|\shref=/i.test(svg));
  assert.ok(svg.includes('&lt;1 ms'));
});
test('standalone SVG includes Japanese labels, timestamps and uncertainty explanations', () => {
  const { svg, width, height } = createNetworkDiagram(report, trace, 'ja');
  assert.ok(svg.includes('ネットワーク経路図')); assert.ok(svg.includes('lang="ja"'));
  assert.ok(svg.includes('ホップ 2')); assert.ok(svg.includes('応答なし / 不明'));
  assert.ok(svg.includes('aria-labelledby="network-title network-description"'));
  assert.equal(width, 1100); assert.ok(height > 600);
  assert.ok(svg.includes('戻り経路'));
});
test('long IPv6 labels and sixteen-hop traces expand the export instead of truncating it', () => {
  const longTrace = { traces: [{ family: 6, hops: Array.from({ length: 16 }, (_, index) => ({ number: index + 1, responded: true, addresses: [`2001:db8:1234:5678:90ab:cdef:1234:${index + 1}`], timesMs: ['12'] })) }] };
  const { svg, height } = createNetworkDiagram(null, longTrace);
  assert.ok(height > 1900); assert.ok(svg.includes('Hop 16'));
  assert.ok(svg.includes('Destination not confirmed by this trace'));
});
