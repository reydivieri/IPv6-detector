import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRoutes, parseTrace } from '../lib/paths.mjs';
import { japanese, translate } from '../public/i18n.js';
import { assess } from '../lib/diagnostics.mjs';

const route = (overrides = {}) => ({ family: 'IPv4', destination: '0.0.0.0/0', nextHop: '192.168.1.1', interfaceId: 1, active: true, interfaceMetric: 10, routeMetric: 5, ...overrides });
const analyze = routes => analyzeRoutes({ routeTable: routes, adapters: [], selectedRoutes: [{ found: true, target: '1.1.1.1', destination: '1.1.1.1/32' }] });
test('alternative defaults are observations, not a claim of unnecessary routing', () => {
  const result = analyze([route(), route({ interfaceId: 2, interfaceMetric: 20 })]);
  assert.equal(result.defaults[0].totalMetric, 15);
  assert.equal(result.findings.find(item => item.family === 'IPv4').code, 'multipleDefaults');
  assert.equal(result.findings.find(item => item.family === 'IPv4').level, 'info');
  assert.equal(result.selected[0].destination, '1.1.1.1/32');
});
test('only equal lowest combined metrics are flagged for review', () => {
  assert.equal(analyze([route(), route({ routeMetric: 10, interfaceMetric: 5 })]).findings[0].code, 'tiedDefaults');
  assert.equal(analyze([route(), route({ routeMetric: 10, interfaceMetric: 10 }), route({ routeMetric: 10, interfaceMetric: 10 })]).findings[0].code, 'multipleDefaults');
});
test('missing metrics stay unknown; disconnected defaults do not compete', () => {
  const result = analyze([route({ interfaceMetric: null }), route({ active: false })]);
  assert.equal(result.defaults[0].totalMetric, null);
  assert.ok(!result.findings.some(item => ['tiedDefaults', 'multipleDefaults'].includes(item.code)));
  assert.ok(result.findings.some(item => item.code === 'inactiveDefaults'));
});
test('virtual adapters and /1 VPN routes are informational observations', () => {
  const result = analyzeRoutes({ routeTable: [route({ destination: '0.0.0.0/1' })], adapters: [{ status: 'Up', physical: false }] });
  assert.equal(result.findings.find(item => item.code === 'virtualAdapters').level, 'info');
  assert.equal(result.findings.find(item => item.code === 'splitRoutes').level, 'info');
});
test('parses replies, unanswered probes and IPv4 destination without treating silence as a fault', () => {
  const result = parseTrace('Tracing route to 1.1.1.1\r\n  1    <1 ms    2 ms    *    192.168.1.1\r\n  2    *    *    *    Request timed out.\r\n  3    12 ms    14 ms    13 ms    1.1.1.1\r\nTrace complete.', '1.1.1.1');
  assert.equal(result.reached, true); assert.equal(result.hops.length, 3);
  assert.deepEqual(result.hops[0].timesMs, ['<1', '2']);
  assert.equal(result.hops[0].unansweredProbes, 1);
  assert.equal(result.hops[1].responded, false);
  assert.deepEqual(result.hops[1].addresses, []);
});
test('parses IPv6, localized timeout lines and partial traces', () => {
  const result = parseTrace('  1    1 ms    2 ms    3 ms    fe80::1%12\n  2    *    *    *    要求がタイムアウトしました。', '2606:4700:4700::1111');
  assert.equal(result.reached, false); assert.equal(result.hops[0].addresses[0], 'fe80::1%12'); assert.equal(result.hops[1].responded, false);
  assert.equal(parseTrace('Unable to contact IP driver. General failure.', '1.1.1.1').hops.length, 0);
});
test('Japanese translations preserve parameters and technical identifiers', () => {
  assert.equal(translate('{count} total adapters detected', 'ja', { count: 5 }), '合計 5 個のアダプターを検出');
  assert.equal(translate('IPv6 TLS test failed: {error}. A failed target does not prove all IPv6 destinations are unavailable.', 'ja', { error: 'ENETUNREACH' }).includes('ENETUNREACH'), true);
  assert.equal(translate('192.168.1.1', 'ja'), '192.168.1.1');
  assert.equal(translate('Network adapters', 'en'), 'Network adapters');
});
test('checklist and recommendations have Japanese translations in success and failure states', () => {
  for (const success of [false, true]) {
    const data = { adapters: success ? [{ status: 'Up', ipv6Enabled: true, addresses: [{ family: 'IPv6', state: 'Preferred', address: '2606:4700::1234' }], gateways: [{ family: 'IPv6' }] }] : [] };
    const result = assess(data, { ipv6: { success, error: 'ENETUNREACH' }, dns: { success, error: 'ENOTFOUND' } });
    for (const check of result.checks) {
      assert.ok(Object.hasOwn(japanese, check.name));
      if (!check.detail.startsWith('AAAA lookup') && !check.detail.startsWith('IPv6 TLS test failed:')) assert.ok(Object.hasOwn(japanese, check.detail), check.detail);
    }
    for (const item of result.recommendations) assert.ok(Object.hasOwn(japanese, item), item);
  }
});
