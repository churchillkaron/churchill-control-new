import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const ingestRoute = fs.readFileSync('app/api/hotel/channels/reservations/route.js', 'utf8');
const ingestRuntime = fs.readFileSync('lib/hotel/channels/HotelChannelReservationIngestRuntime.js', 'utf8');
const writeBarrier = fs.readFileSync('supabase/migrations/20260906161000_hotel_business_day_write_barrier.sql', 'utf8');

test('OTA reservation ingest mutates canonical Hotel bookings through the guarded channel RPC', () => {
  assert.match(ingestRuntime, /hotel_apply_channel_reservation_guarded/);
  assert.match(writeBarrier, /create trigger hotel_bookings_business_day_barrier/);
  assert.match(writeBarrier, /before insert or update or delete on public\.hotel_bookings/);
});

test('successful OTA processing wakes Hotel devices only after governed ingest completes', () => {
  const runtimeCall = ingestRoute.indexOf('HotelChannelReservationIngestRuntime.pullAndProcess');
  const countCheck = ingestRoute.indexOf('Number(result?.processedCount || 0) > 0');
  const broadcast = ingestRoute.indexOf('broadcastHotelReadinessChanged');
  const source = ingestRoute.indexOf("source: 'channel-reservation-ingest'");
  const response = ingestRoute.indexOf('return NextResponse.json(result)');

  assert.ok(runtimeCall >= 0);
  assert.ok(countCheck > runtimeCall);
  assert.ok(source > countCheck);
  assert.ok(response > source);
  assert.match(ingestRoute, /action: 'RESERVATIONS_PROCESSED'/);
  assert.match(ingestRoute, /requireOrganizationAccess/);
});

test('OTA invalidation remains data-free and does not publish booking or reservation identifiers', () => {
  const broadcastBlockStart = ingestRoute.indexOf('await broadcastHotelReadinessChanged');
  const broadcastBlockEnd = ingestRoute.indexOf('});', broadcastBlockStart);
  const block = ingestRoute.slice(broadcastBlockStart, broadcastBlockEnd + 3);
  assert.doesNotMatch(block, /bookingId|booking_id|reservationId|reservation_id|connectionId|connection_id/);
  assert.match(block, /organizationId: access\.organizationId/);
  assert.match(block, /source: 'channel-reservation-ingest'/);
});
