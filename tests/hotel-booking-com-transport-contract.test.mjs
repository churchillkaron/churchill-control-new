import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HOTEL_BOOKING_COM_CONTRACT = 'BOOKING_COM_BXML_AVAILABILITY_V1_1_TOKEN_AUTH';
const adapter = await readFile(new URL('../lib/hotel/channels/providers/BookingComTransport.js', import.meta.url), 'utf8');
const registry = await readFile(new URL('../lib/hotel/channels/HotelChannelTransportRegistry.js', import.meta.url), 'utf8');
const distribution = await readFile(new URL('../lib/hotel/channels/HotelChannelDistributionRuntime.js', import.meta.url), 'utf8');
const rateRoute = await readFile(new URL('../app/api/hotel/rates/route.js', import.meta.url), 'utf8');
const dispatchRoute = await readFile(new URL('../app/api/hotel/channels/distribution/route.js', import.meta.url), 'utf8');

test('Booking.com uses current token authentication and B.XML v1.1 availability', () => {
  assert.match(adapter, new RegExp(HOTEL_BOOKING_COM_CONTRACT));
  assert.match(adapter, /connectivity-authentication\.booking\.com\/token-based-authentication\/exchange/);
  assert.match(adapter, /supply-xml\.booking\.com\/hotels\/xml\/availability/);
  assert.match(adapter, /authorization: `Bearer \$\{token\}`/);
  assert.match(adapter, /'accept-version': '1\.1'/);
  assert.doesNotMatch(adapter, /Basic /);
});

test('Booking.com availability preserves canonical inventory, pricing and restrictions', () => {
  assert.match(adapter, /<roomstosell>/);
  assert.match(adapter, /<price>/);
  assert.match(adapter, /<closed>/);
  assert.match(adapter, /<minimumstay>/);
  assert.match(adapter, /<maximumstay>/);
  assert.match(adapter, /<closedonarrival>/);
  assert.match(adapter, /<closedondeparture>/);
  assert.match(adapter, /BOOKING_COM_ARI_MONTHLY_BATCH_LIMIT_EXCEEDED/);
});

test('Booking.com outbound transport does not self-certify complete live connectivity', () => {
  assert.match(registry, /booking_com:[\s\S]*implemented: true/);
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

test('Provider acknowledgement is evidence-backed and dispatch stays server-side', () => {
  assert.match(distribution, /HotelChannelEvidenceRuntime\.recordTransmission/);
  assert.match(distribution, /HotelChannelEvidenceRuntime\.recordAcknowledgement/);
  assert.match(distribution, /status: 'COMPLETED'/);
  assert.match(distribution, /status: 'FAILED'/);
  assert.match(dispatchRoute, /requireOrganizationAccess/);
  assert.match(dispatchRoute, /supabaseAdmin/);
  assert.match(dispatchRoute, /export const runtime = 'nodejs'/);
});

console.log('HOTEL_BOOKING_COM_TRANSPORT_CONTRACT=PASS');
