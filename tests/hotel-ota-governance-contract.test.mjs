import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [migration, channelsRoute, ratesRoute, evidenceRuntime] = await Promise.all([
  read('supabase/migrations/20260905143000_hotel_ota_transport_reconciliation.sql'),
  read('app/api/hotel/channels/route.js'),
  read('app/api/hotel/rates/route.js'),
  read('lib/hotel/channels/HotelChannelEvidenceRuntime.js'),
]);

test('OTA evidence tables are service-only and reconciliation stays SECURITY INVOKER', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.hotel_channel_transmissions from anon, authenticated/);
  assert.match(migration, /revoke all on table public\.hotel_channel_reservation_events from anon, authenticated/);
  assert.match(migration, /revoke all on table public\.hotel_channel_reservation_reconciliations from anon, authenticated/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /grant select, insert on table public\.hotel_channel_reservation_reconciliations to service_role/);
  assert.doesNotMatch(migration, /grant .*update.*hotel_channel_reservation_reconciliations/i);
  assert.doesNotMatch(migration, /grant .*delete.*hotel_channel_reservation_reconciliations/i);
});

test('credential readiness derives from the existing secret reference without exposing it', () => {
  assert.doesNotMatch(migration, /add column if not exists credential_configured/i);
  assert.match(channelsRoute, /credential_secret_ref: credentialSecretRef/);
  assert.match(channelsRoute, /credential_configured: Boolean\(clean\(credentialSecretRef\)\)/);
  assert.match(channelsRoute, /connection: sanitizeConnection\(data\)/);
});

test('mapping evidence is scoped through property-owned connection ids, not a nonexistent mapping property column', () => {
  const mappingQuery = channelsRoute.match(/supabaseAdmin\.from\("hotel_channel_mappings"\)[\s\S]*?\.in\("connection_id", connectionIds\)/)?.[0] || '';
  assert.ok(mappingQuery);
  assert.doesNotMatch(mappingQuery, /\.eq\("property_id"/);
});

test('rate distribution only enters the queue for credentialed, certified, enabled mappings', () => {
  assert.match(ratesRoute, /\.eq\("status", "ACTIVE"\)/);
  assert.match(ratesRoute, /\.eq\("provider_certified", true\)/);
  assert.match(ratesRoute, /\.eq\("enabled", true\)/);
  assert.match(ratesRoute, /filter\(\(connection\) => Boolean\(clean\(connection\.credential_secret_ref\)\)\)/);
  assert.match(ratesRoute, /providerTransmissionClaimed: false/);
});

test('reservation reconciliation is delegated to one atomic database function', () => {
  assert.match(evidenceRuntime, /rpc\('hotel_reconcile_channel_reservation_event'/);
  assert.match(migration, /for update;/i);
  assert.match(migration, /insert into public\.hotel_channel_reservation_reconciliations/);
  assert.match(migration, /update public\.hotel_channel_reservation_events/);
});

test('provider acknowledgement is terminal and compare-and-set guarded', () => {
  assert.match(evidenceRuntime, /terminal\.includes\(currentStatus\)/);
  assert.match(evidenceRuntime, /\.eq\('status', existing\.status\)/);
  assert.match(evidenceRuntime, /lost a concurrent terminal-state race/);
});
