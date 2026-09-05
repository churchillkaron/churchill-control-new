import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../lib/hotel/channels/HotelChannelReadiness.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { buildHotelChannelReadiness } = await import(moduleUrl);

function connection(overrides = {}) {
  return {
    external_property_id: 'hotel-123',
    credential_configured: true,
    provider_certified: true,
    enabled: true,
    ...overrides,
  };
}

test('Hotel OTA readiness fails closed when no connection exists', () => {
  const readiness = buildHotelChannelReadiness();
  assert.equal(readiness.live, false);
  assert.equal(readiness.code, 'NOT_CONNECTED');
});

test('Hotel OTA readiness never treats configuration alone as live', () => {
  const readiness = buildHotelChannelReadiness({ connection: connection(), mappingCount: 1 });
  assert.equal(readiness.live, false);
  assert.equal(readiness.code, 'TRANSMISSION_REQUIRED');
});

test('Hotel OTA readiness blocks missing provider acknowledgement', () => {
  const readiness = buildHotelChannelReadiness({
    connection: connection(),
    mappingCount: 1,
    latestTransmission: { status: 'SENT' },
  });
  assert.equal(readiness.live, false);
  assert.equal(readiness.code, 'ACKNOWLEDGEMENT_REQUIRED');
});

test('Hotel OTA readiness blocks un-reconciled reservation evidence', () => {
  const readiness = buildHotelChannelReadiness({
    connection: connection(),
    mappingCount: 1,
    latestTransmission: { status: 'ACKNOWLEDGED' },
    latestReservationEvent: { status: 'NORMALIZED' },
  });
  assert.equal(readiness.live, false);
  assert.equal(readiness.code, 'RECONCILIATION_REQUIRED');
});

test('Hotel OTA readiness becomes live only with the complete evidence chain', () => {
  const readiness = buildHotelChannelReadiness({
    connection: connection(),
    mappingCount: 1,
    latestTransmission: { status: 'ACKNOWLEDGED' },
    latestReservationEvent: { status: 'RECONCILED' },
    latestReconciliation: { status: 'MATCHED' },
  });
  assert.equal(readiness.live, true);
  assert.equal(readiness.code, 'LIVE');
  assert.deepEqual(readiness.blockers, []);
});
