import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HOTEL_BOOKING_COM_CONTRACT = 'BOOKING_COM_BXML_ARI_AND_OTA_RESERVATIONS_TOKEN_AUTH';
const adapter = await readFile(new URL('../lib/hotel/channels/providers/BookingComTransport.js', import.meta.url), 'utf8');
const otaParser = await readFile(new URL('../lib/hotel/channels/providers/BookingComOtaReservations.js', import.meta.url), 'utf8');
const registry = await readFile(new URL('../lib/hotel/channels/HotelChannelTransportRegistry.js', import.meta.url), 'utf8');
const distribution = await readFile(new URL('../lib/hotel/channels/HotelChannelDistributionRuntime.js', import.meta.url), 'utf8');
const ingest = await readFile(new URL('../lib/hotel/channels/HotelChannelReservationIngestRuntime.js', import.meta.url), 'utf8');
const rateRoute = await readFile(new URL('../app/api/hotel/rates/route.js', import.meta.url), 'utf8');
const dispatchRoute = await readFile(new URL('../app/api/hotel/channels/distribution/route.js', import.meta.url), 'utf8');
const ingestRoute = await readFile(new URL('../app/api/hotel/channels/reservations/route.js', import.meta.url), 'utf8');

test('Booking.com uses current token authentication for B.XML and OTA reservations', () => {
  assert.match(adapter, new RegExp(HOTEL_BOOKING_COM_CONTRACT));
  assert.match(adapter, /connectivity-authentication\.booking\.com\/token-based-authentication\/exchange/);
  assert.match(adapter, /supply-xml\.booking\.com\/hotels\/xml\/availability/);
  assert.match(adapter, /secure-supply-xml\.booking\.com\/hotels\/ota\/OTA_HotelResNotif/);
  assert.match(adapter, /secure-supply-xml\.booking\.com\/hotels\/ota\/OTA_HotelResModifyNotif/);
  assert.match(adapter, /authorization: `Bearer \$\{token\}`/);
  assert.match(adapter, /TOKEN_CACHE_TTL_MS/);
  assert.match(adapter, /response\.status !== 401/);
  assert.doesNotMatch(adapter, /Basic /);
});

test('Booking.com availability preserves canonical inventory, pricing and restrictions', () => {
  assert.match(adapter, /<roomstosell>/);
  assert.match(adapter, /integer\(row\.inventory, 'INVENTORY', 0, 255\)/);
  assert.match(adapter, /<price>/);
  assert.match(adapter, /<closed>/);
  assert.match(adapter, /<minimumstay>/);
  assert.match(adapter, /<maximumstay>/);
  assert.match(adapter, /<closedonarrival>/);
  assert.match(adapter, /<closedondeparture>/);
  assert.match(adapter, /BOOKING_COM_ARI_MONTHLY_BATCH_LIMIT_EXCEEDED/);
});

test('Booking.com OTA parser is bounded, normalizes minor units and strips payment data', () => {
  assert.match(otaParser, /MAX_XML_BYTES/);
  assert.match(otaParser, /MAX_XML_NODES/);
  assert.match(otaParser, /MAX_XML_DEPTH/);
  assert.match(otaParser, /BOOKING_COM_OTA_XML_DTD_FORBIDDEN/);
  assert.match(otaParser, /DecimalPlaces/);
  assert.match(otaParser, /minorUnits \/ \(10 \*\* decimalPlaces\)/);
  assert.match(otaParser, /BOOKING_COM_OTA_AMOUNT_INVALID/);
  assert.match(otaParser, /payment_details_redacted: true/);
  assert.match(otaParser, /sensitive_payment_data_persisted: false/);
  assert.doesNotMatch(otaParser, /CardNumber\s*:/);
});

test('Booking.com inbound processing persists and reconciles before acknowledgement', () => {
  const evidenceIndex = ingest.indexOf('recordReservationEvent');
  const applyIndex = ingest.indexOf("hotel_apply_channel_reservation_guarded");
  const reconcileIndex = ingest.indexOf('recordReconciliation');
  const ackIndex = ingest.lastIndexOf('acknowledgeReservation({');
  assert.ok(evidenceIndex >= 0);
  assert.ok(applyIndex > evidenceIndex);
  assert.ok(reconcileIndex > applyIndex);
  assert.ok(ackIndex > reconcileIndex);
  assert.match(ingest, /channel_room_stay_id/);
  assert.match(ingest, /HOTEL_CHANNEL_BOOKING_NOT_FOUND_FOR_CANCEL/);
  assert.match(ingest, /BOOKING_COM_RESERVATION_PROPERTY_MISMATCH/);
  assert.match(ingest, /allAlreadyMatched/);
});

test('Booking.com stale acknowledgements re-fetch the exact latest reservation before retry', () => {
  assert.match(adapter, /url\.searchParams\.set\('id', clean\(externalReservationId\)\)/);
  assert.match(adapter, /BOOKING_COM_OTA_ACK_STALE_RESERVATION/);
  assert.match(adapter, /response\.status === 409/);
  assert.match(adapter, /explicitSuccess/);
  assert.match(ingest, /MAX_STALE_ACK_CONVERGENCE_ATTEMPTS/);
  assert.match(ingest, /pullLatestExactReservation/);
  assert.match(ingest, /BOOKING_COM_OTA_STALE_RESERVATION_VERSION_DID_NOT_ADVANCE/);
  assert.match(ingest, /externalReservationId: reservation\.external_reservation_id/);
});

test('Booking.com remains non-live until inbound implementation is explicitly certified', () => {
  assert.match(registry, /booking_com:[\s\S]*outboundImplemented: true/);
  assert.match(registry, /booking_com:[\s\S]*reservationIngestImplemented: false/);
  assert.match(registry, /isHotelChannelLiveTransportImplemented/);
});

test('Hotel distribution revalidates canonical state before provider dispatch', () => {
  assert.match(rateRoute, /hotelRateDistributionFingerprint/);
  assert.match(rateRoute, /request_fingerprint: requestFingerprint/);
  assert.match(distribution, /HOTEL_CHANNEL_CANONICAL_STATE_CHANGED_AFTER_QUEUE/);
  assert.match(distribution, /HOTEL_CHANNEL_CANONICAL_ROW_COUNT_CHANGED/);
  assert.match(distribution, /HOTEL_CHANNEL_EXACT_MAPPING_REQUIRED/);
  assert.match(distribution, /BOOKING_COM_EXPLICIT_OR_DERIVED_INVENTORY_REQUIRED_BEFORE_TRANSMISSION/);
});

test('Provider operations stay server-side behind organization access', () => {
  assert.match(distribution, /HotelChannelEvidenceRuntime\.recordTransmission/);
  assert.match(distribution, /HotelChannelEvidenceRuntime\.recordAcknowledgement/);
  assert.match(dispatchRoute, /requireOrganizationAccess/);
  assert.match(dispatchRoute, /supabaseAdmin/);
  assert.match(dispatchRoute, /export const runtime = 'nodejs'/);
  assert.match(ingestRoute, /requireOrganizationAccess/);
  assert.match(ingestRoute, /supabaseAdmin/);
  assert.match(ingestRoute, /export const runtime = 'nodejs'/);
});

console.log('HOTEL_BOOKING_COM_TRANSPORT_CONTRACT=PASS');
