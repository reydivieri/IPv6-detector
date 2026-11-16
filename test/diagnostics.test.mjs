import test from 'node:test';
import assert from 'node:assert/strict';
import { addressScope, assess } from '../lib/diagnostics.mjs';
const connectivity = (success = false) => ({ ipv4: { success: true }, ipv6: { success, error: 'ENETUNREACH' }, dns: { success: true } });
const adapter = (overrides = {}) => ({ status: 'Up', ipv6Enabled: true, addresses: [], gateways: [], ...overrides });

test('separates global IPv6 from link-local, ULA, multicast and IPv4', () => {
  for (const [address, expected] of [['2606:4700::1111', 'Global'], ['2001:db8::1', 'Global'], ['fe80::1%12', 'Link-local'], ['febf::1', 'Link-local'], ['fd00::1', 'Private (ULA)'], ['fc00::1', 'Private (ULA)'], ['::1', 'Loopback'], ['ff02::1', 'Other IPv6'], ['192.168.1.1', 'IPv4']]) assert.equal(addressScope(address), expected);
});
test('link-local support does not imply public IPv6 connectivity', () => {
  const result = assess({ adapters: [adapter({ addresses: [{ address: 'fe80::1', family: 'IPv6', state: 'Preferred' }] })] }, connectivity());
  assert.equal(result.status, 'IPv6 needs attention');
  assert.equal(result.checks[1].status, 'pass');
  assert.equal(result.checks[2].status, 'warn');
  assert.equal(result.checks[5].status, 'warn');
});
test('global addresses and a default route do not prove external reachability', () => {
  const result = assess({ adapters: [adapter({ addresses: [{ address: '2400::1', family: 'IPv6', state: 'Preferred' }], gateways: [{ family: 'IPv6' }] })] }, connectivity());
  assert.equal(result.checks[2].status, 'pass');
  assert.equal(result.checks[3].status, 'pass');
  assert.equal(result.tone, 'warn');
});
test('inactive and tentative addresses are not considered ready', () => {
  const result = assess({ adapters: [adapter({ addresses: [{ address: '2400::1', family: 'IPv6', state: 'Tentative' }] }), adapter({ status: 'Disconnected', addresses: [{ address: '2400::2', family: 'IPv6', state: 'Preferred' }], gateways: [{ family: 'IPv6' }] })] }, connectivity());
  assert.equal(result.checks[1].status, 'warn');
  assert.equal(result.checks[2].status, 'warn');
  assert.equal(result.checks[3].status, 'warn');
});
test('unknown bindings are reported as unknown', () => {
  const result = assess({ adapters: [adapter({ ipv6Enabled: null })] }, connectivity());
  assert.equal(result.checks[0].status, 'unknown');
  assert.equal(result.device, 'IPv6 support not confirmed');
});
test('a successful external IPv6 connection is the connectivity verdict', () => {
  const result = assess({ adapters: [] }, connectivity(true));
  assert.equal(result.status, 'IPv6 connected');
  assert.equal(result.tone, 'pass');
});
test('no connected adapters produces an actionable recommendation', () => {
  const result = assess({ adapters: [] }, connectivity());
  assert.match(result.recommendations[0], /Connect a network adapter/);
});
