import { NextResponse } from 'next/server';

import { HotelChannelReservationIngestRuntime } from '@/lib/hotel/channels/HotelChannelReservationIngestRuntime';
import { requireOrganizationAccess } from '@/lib/platform/security/requireOrganizationAccess';
import { supabaseAdmin } from '@/lib/shared/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_EVENTS = 250;

function clean(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function firstRoomPayload(event) {
  const payload = event?.normalized_payload || {};
  return payload?.room && typeof payload.room === 'object' ? payload.room : {};
}

function providerGuestName(event) {
  const payload = event?.normalized_payload || {};
  return clean(payload?.guest?.full_name || payload?.booker?.full_name) || null;
}

function workState(event) {
  const status = clean(event?.status).toUpperCase();
  const ackStatus = clean(event?.provider_ack_status).toUpperCase() || 'PENDING';
  if (status === 'MANUAL_REVIEW' || status === 'REJECTED') return 'CANONICAL_REVIEW';
  if (ackStatus === 'RETRY_REQUIRED') return 'PROVIDER_RETRY';
  if (status === 'RECONCILED' && ackStatus === 'PENDING') return 'AWAITING_ACK';
  if (status === 'RECONCILED' && ['ACKNOWLEDGED', 'SUPERSEDED'].includes(ackStatus)) return 'SETTLED';
  return 'PROCESSING';
}

function operatorIssue(event) {
  const code = clean(event?.provider_ack_error_code || event?.error_code).toUpperCase();
  const message = clean(event?.provider_ack_error_message || event?.error_message);
  if (/CHECKED_IN/.test(code) || /CHECKED_IN/.test(message)) return 'The guest is already checked in. Review the OTA change against the live stay before making any manual correction.';
  if (/INVENTORY/.test(code) || /INVENTORY/.test(message)) return 'The requested room type cannot be placed safely without breaking physical inventory or a protected group block.';
  if (/MAPPING/.test(code) || /MAPPING/.test(message)) return 'The OTA room/rate combination does not have one exact active Avantiqo mapping.';
  if (/PROPERTY_MISMATCH/.test(code) || /PROPERTY_MISMATCH/.test(message)) return 'The provider reservation points at a different hotel property than this channel connection.';
  if (/STALE_RESERVATION/.test(code) || /STALE_RESERVATION/.test(message)) return 'Booking.com changed the reservation while Avantiqo was acknowledging it. The newest version must converge before acknowledgement.';
  if (clean(event?.provider_ack_status).toUpperCase() === 'RETRY_REQUIRED') return 'The stay is safe in Avantiqo, but Booking.com has not accepted the acknowledgement yet. The provider message remains retryable.';
  if (clean(event?.status).toUpperCase() === 'MANUAL_REVIEW') return 'Automatic reconciliation stopped because applying this OTA event safely requires a hotel operator decision.';
  return message || null;
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get('organizationId') || request.nextUrl.searchParams.get('organization_id'));
    const propertyId = clean(request.nextUrl.searchParams.get('propertyId') || request.nextUrl.searchParams.get('property_id'));
    if (!organizationId) return NextResponse.json({ success: false, error: 'organizationId required' }, { status: 400 });

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json(access, { status: access.status });

    let connectionQuery = supabaseAdmin
      .from('hotel_channel_connections')
      .select('id,property_id,provider,display_name,external_property_id,status,provider_certified,enabled,last_sync_at,last_success_at,last_error')
      .eq('organization_id', access.organizationId)
      .order('display_name', { ascending: true });
    if (propertyId) connectionQuery = connectionQuery.eq('property_id', propertyId);

    let eventQuery = supabaseAdmin
      .from('hotel_channel_reservation_events')
      .select('id,property_id,connection_id,provider,external_reservation_id,event_type,event_version,status,booking_id,discrepancy_summary,error_code,error_message,provider_ack_status,provider_acknowledged_at,provider_ack_error_code,provider_ack_error_message,provider_ack_detail,normalized_payload,received_at,processed_at,reconciled_at,created_at,updated_at')
      .eq('organization_id', access.organizationId)
      .order('received_at', { ascending: false })
      .limit(MAX_EVENTS);
    if (propertyId) eventQuery = eventQuery.eq('property_id', propertyId);

    const [connectionsResult, eventsResult] = await Promise.all([connectionQuery, eventQuery]);
    if (connectionsResult.error) throw connectionsResult.error;
    if (eventsResult.error) throw eventsResult.error;

    const connections = connectionsResult.data || [];
    const events = eventsResult.data || [];
    const bookingIds = unique(events.map((event) => event.booking_id));
    const eventIds = unique(events.map((event) => event.id));

    const [bookingsResult, reconciliationsResult] = await Promise.all([
      bookingIds.length
        ? supabaseAdmin.from('hotel_bookings').select('id,guest_id,room_id,booking_reference,check_in_date,check_out_date,status,source,total_amount,paid_amount,payment_status,currency_code,channel_connection_id,external_reservation_id,channel_room_stay_id').eq('organization_id', access.organizationId).in('id', bookingIds)
        : Promise.resolve({ data: [], error: null }),
      eventIds.length
        ? supabaseAdmin.from('hotel_channel_reservation_reconciliations').select('id,reservation_event_id,booking_id,status,comparison,reconciled_at,created_at').eq('organization_id', access.organizationId).in('reservation_event_id', eventIds).order('reconciled_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (bookingsResult.error) throw bookingsResult.error;
    if (reconciliationsResult.error) throw reconciliationsResult.error;

    const bookings = bookingsResult.data || [];
    const guestIds = unique(bookings.map((booking) => booking.guest_id));
    const roomIds = unique(bookings.map((booking) => booking.room_id));
    const [guestsResult, roomsResult] = await Promise.all([
      guestIds.length
        ? supabaseAdmin.from('hotel_guests').select('id,full_name,email,phone,vip_status,preferred_language').eq('organization_id', access.organizationId).in('id', guestIds)
        : Promise.resolve({ data: [], error: null }),
      roomIds.length
        ? supabaseAdmin.from('hotel_rooms').select('id,room_number,room_type,floor,status').eq('organization_id', access.organizationId).in('id', roomIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (guestsResult.error) throw guestsResult.error;
    if (roomsResult.error) throw roomsResult.error;

    const connectionById = new Map(connections.map((row) => [row.id, row]));
    const bookingById = new Map(bookings.map((row) => [row.id, row]));
    const guestById = new Map((guestsResult.data || []).map((row) => [row.id, row]));
    const roomById = new Map((roomsResult.data || []).map((row) => [row.id, row]));
    const reconciliationByEvent = new Map();
    for (const row of reconciliationsResult.data || []) {
      if (!reconciliationByEvent.has(row.reservation_event_id)) reconciliationByEvent.set(row.reservation_event_id, row);
    }

    const items = events.map((event) => {
      const booking = event.booking_id ? bookingById.get(event.booking_id) || null : null;
      const providerRoom = firstRoomPayload(event);
      const canonicalGuest = booking?.guest_id ? guestById.get(booking.guest_id) || null : null;
      const canonicalRoom = booking?.room_id ? roomById.get(booking.room_id) || null : null;
      const connection = connectionById.get(event.connection_id) || null;
      const state = workState(event);
      return {
        id: event.id,
        externalReservationId: event.external_reservation_id,
        eventType: event.event_type,
        eventVersion: event.event_version,
        receivedAt: event.received_at,
        processedAt: event.processed_at,
        reconciledAt: event.reconciled_at,
        eventStatus: event.status,
        providerAckStatus: event.provider_ack_status || 'PENDING',
        providerAcknowledgedAt: event.provider_acknowledged_at,
        workState: state,
        needsAttention: ['CANONICAL_REVIEW', 'PROVIDER_RETRY'].includes(state),
        issue: operatorIssue(event),
        provider: {
          id: event.provider,
          name: connection?.display_name || event.provider,
          connectionId: event.connection_id,
          connectionStatus: connection?.status || null,
          certified: connection?.provider_certified === true,
          enabled: connection?.enabled === true,
        },
        providerStay: {
          guestName: providerGuestName(event),
          roomTypeId: clean(providerRoom.external_room_type_id) || null,
          ratePlanId: clean(providerRoom.external_rate_plan_id) || null,
          checkInDate: providerRoom.check_in_date || null,
          checkOutDate: providerRoom.check_out_date || null,
          adults: providerRoom.adults ?? null,
          children: providerRoom.children ?? null,
          amount: providerRoom.amount ?? null,
          currencyCode: clean(providerRoom.currency_code) || null,
          roomStayId: clean(providerRoom.channel_room_stay_id) || null,
        },
        booking: booking ? {
          id: booking.id,
          reference: booking.booking_reference,
          checkInDate: booking.check_in_date,
          checkOutDate: booking.check_out_date,
          status: booking.status,
          source: booking.source,
          totalAmount: booking.total_amount,
          paidAmount: booking.paid_amount,
          paymentStatus: booking.payment_status,
          currencyCode: booking.currency_code,
          roomStayId: booking.channel_room_stay_id,
        } : null,
        guest: canonicalGuest ? {
          id: canonicalGuest.id,
          fullName: canonicalGuest.full_name,
          email: canonicalGuest.email,
          phone: canonicalGuest.phone,
          vipStatus: canonicalGuest.vip_status,
          preferredLanguage: canonicalGuest.preferred_language,
        } : null,
        room: canonicalRoom ? {
          id: canonicalRoom.id,
          number: canonicalRoom.room_number,
          type: canonicalRoom.room_type,
          floor: canonicalRoom.floor,
          status: canonicalRoom.status,
        } : null,
        reconciliation: reconciliationByEvent.get(event.id) || null,
      };
    });

    const summary = {
      total: items.length,
      needsAttention: items.filter((item) => item.needsAttention).length,
      awaitingAck: items.filter((item) => item.workState === 'AWAITING_ACK').length,
      settled: items.filter((item) => item.workState === 'SETTLED').length,
      newReservations: items.filter((item) => clean(item.eventType).toUpperCase() === 'NEW').length,
      modifications: items.filter((item) => clean(item.eventType).toUpperCase() === 'MODIFY').length,
      cancellations: items.filter((item) => clean(item.eventType).toUpperCase() === 'CANCEL').length,
    };

    return NextResponse.json({ success: true, connections, summary, items });
  } catch (error) {
    console.error('HOTEL_CHANNEL_RESERVATION_CONTROL_ERROR', error);
    return NextResponse.json({ success: false, error: clean(error?.message) || 'Unable to load Hotel channel reservations' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body?.organizationId || body?.organization_id);
    const action = clean(body?.action).toUpperCase();
    const reservationEventId = clean(body?.reservationEventId || body?.reservation_event_id);
    if (!organizationId) return NextResponse.json({ success: false, error: 'organizationId required' }, { status: 400 });
    if (!reservationEventId) return NextResponse.json({ success: false, error: 'reservationEventId required' }, { status: 400 });
    if (action !== 'RETRY_PROVIDER_HANDOFF') {
      return NextResponse.json({ success: false, error: 'Unsupported Hotel channel reservation action' }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json(access, { status: access.status });

    const result = await HotelChannelReservationIngestRuntime.retryProviderHandoff({
      supabase: supabaseAdmin,
      organizationId: access.organizationId,
      reservationEventId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = clean(error?.code || error?.message).split(':')[0];
    const status = /NOT_ALLOWED|NOT_FOUND|INVALID|REQUIRED/.test(code) ? 409 : 500;
    console.error('HOTEL_CHANNEL_RESERVATION_ACTION_ERROR', error);
    return NextResponse.json({ success: false, error: code || 'Unable to complete Hotel channel reservation action' }, { status });
  }
}
