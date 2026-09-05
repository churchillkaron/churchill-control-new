import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ingest = await readFile(new URL('../lib/hotel/channels/HotelChannelReservationIngestRuntime.js', import.meta.url), 'utf8');
const evidence = await readFile(new URL('../lib/hotel/channels/HotelChannelEvidenceRuntime.js', import.meta.url), 'utf8');
const registry = await readFile(new URL('../lib/hotel/channels/HotelChannelTransportRegistry.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/hotel/channels/reservation-control/route.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/(system)/workspace/[organizationId]/operations/channel-reservations/page.jsx', import.meta.url), 'utf8');
const workspace = await readFile(new URL('../components/workspace/hotel/HotelWorkspaceUI.jsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260905065823_hotel_channel_inbound_ack_evidence.sql', import.meta.url), 'utf8');

test('inbound replay uses the reservation-event state actually persisted by reconciliation', () => {
  assert.match(ingest, /clean\(event\.status\)\.toUpperCase\(\) === 'RECONCILED'/);
  assert.doesNotMatch(ingest, /clean\(event\.status\)\.toUpperCase\(\) === 'MATCHED'/);
  assert.match(ingest, /allProviderSettled/);
  assert.match(ingest, /replaySettled: true/);
});

test('provider acknowledgement is separate governed evidence', () => {
  assert.match(migration, /provider_ack_status text not null default 'PENDING'/);
  assert.match(migration, /'ACKNOWLEDGED','SUPERSEDED','RETRY_REQUIRED'/);
  assert.match(evidence, /recordReservationProviderAcknowledgement/);
  assert.match(evidence, /recordReservationProcessingFailure/);
  assert.match(ingest, /status: 'ACKNOWLEDGED'/);
  assert.match(ingest, /status: 'SUPERSEDED'/);
  assert.match(ingest, /status: 'RETRY_REQUIRED'/);
});

test('reservation control API is organization-authorized and does not expose transport credentials or raw payload', () => {
  assert.match(api, /requireOrganizationAccess/);
  assert.match(api, /supabaseAdmin/);
  assert.match(api, /export const runtime = 'nodejs'/);
  assert.match(api, /provider_ack_status/);
  assert.match(api, /CANONICAL_REVIEW/);
  assert.match(api, /PROVIDER_RETRY/);
  assert.match(api, /AWAITING_ACK/);
  assert.match(api, /SETTLED/);
  assert.doesNotMatch(api, /credential_secret_ref/);
  assert.doesNotMatch(api, /normalizedPayload:/);
  assert.doesNotMatch(api, /CardNumber/);
});

test('operator retry is limited to an already reconciled canonical stay and refetches provider truth', () => {
  assert.match(ingest, /retryProviderHandoff/);
  assert.match(ingest, /eventStatus !== 'RECONCILED'/);
  assert.match(ingest, /!data\.booking_id/);
  assert.match(ingest, /!\['PENDING', 'RETRY_REQUIRED'\]\.includes\(ackStatus\)/);
  assert.match(ingest, /pullLatestExactReservation/);
  assert.match(ingest, /status: 'SUPERSEDED'/);
  assert.match(ingest, /return processReservation|const result = await processReservation/);
  assert.match(ingest, /HOTEL_CHANNEL_RESERVATION_RETRY_NOT_ALLOWED/);
});

test('reservation control POST exposes only the governed provider-handoff retry', () => {
  assert.match(api, /export async function POST/);
  assert.match(api, /RETRY_PROVIDER_HANDOFF/);
  assert.match(api, /HotelChannelReservationIngestRuntime\.retryProviderHandoff/);
  assert.match(api, /requireOrganizationAccess/);
  assert.match(api, /Unsupported Hotel channel reservation action/);
});

test('Hotel staff get an attention-first channel reservation workspace with safe handoff recovery', () => {
  assert.match(workspace, /id: "channel-reservations", label: "Channel Reservations"/);
  assert.match(page, /active="channel-reservations"/);
  assert.match(page, /Needs attention/);
  assert.match(page, /Awaiting OTA ACK/);
  assert.match(page, /Open stay/);
  assert.match(page, /Changes/);
  assert.match(page, /Cancellations/);
  assert.match(page, /Retry OTA handoff/);
  assert.match(page, /\["PROVIDER_RETRY", "AWAITING_ACK"\]\.includes\(item\.workState\)/);
  assert.doesNotMatch(page, /CANONICAL_REVIEW[^\n]*Retry OTA handoff/);
  assert.match(page, /Automation stops before it can damage an in-house stay/);
  assert.match(page, /refetches provider truth before acknowledgement/);
});

test('Booking.com live gate stays false until inbound transport is explicitly certified', () => {
  assert.match(registry, /booking_com:[\s\S]*reservationIngestImplemented: false/);
});

console.log('HOTEL_CHANNEL_RESERVATION_CONTROL_CONTRACT=PASS');
