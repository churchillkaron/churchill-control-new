import { HotelChannelEvidenceRuntime, hotelChannelEvidenceFingerprint } from '@/lib/hotel/channels/HotelChannelEvidenceRuntime';
import { requireHotelChannelTransport } from '@/lib/hotel/channels/HotelChannelTransportRegistry';
import { bookingComOtaExternalEventId } from '@/lib/hotel/channels/providers/BookingComOtaReservations';

const MAX_STALE_ACK_CONVERGENCE_ATTEMPTS = 2;

function clean(value) {
  return String(value ?? '').trim();
}

function safeEmail(value) {
  const email = clean(value).toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function roomStayId(room, ordinal, duplicateOrdinal = 0) {
  const providerIndex = clean(room?.index);
  if (providerIndex) return providerIndex;
  const fingerprint = hotelChannelEvidenceFingerprint({
    external_room_type_id: room?.external_room_type_id,
    external_rate_plan_id: room?.external_rate_plan_id,
    check_in_date: room?.check_in_date,
    check_out_date: room?.check_out_date,
    adults: room?.adults,
    children: room?.children,
    amount: room?.amount,
    currency_code: room?.currency_code,
  }).slice(0, 24);
  return `room-${fingerprint}-${duplicateOrdinal || ordinal + 1}`;
}

function normalizeRooms(reservation) {
  const seen = new Map();
  return (reservation?.rooms || []).map((room, ordinal) => {
    const base = hotelChannelEvidenceFingerprint({
      external_room_type_id: room?.external_room_type_id,
      external_rate_plan_id: room?.external_rate_plan_id,
      check_in_date: room?.check_in_date,
      check_out_date: room?.check_out_date,
      adults: room?.adults,
      children: room?.children,
      amount: room?.amount,
      currency_code: room?.currency_code,
    }).slice(0, 24);
    const duplicateOrdinal = (seen.get(base) || 0) + 1;
    seen.set(base, duplicateOrdinal);
    return { ...room, channel_room_stay_id: roomStayId(room, ordinal, duplicateOrdinal) };
  });
}

async function loadConnection({ supabase, organizationId, connectionId }) {
  const { data, error } = await supabase
    .from('hotel_channel_connections')
    .select('id,organization_id,property_id,provider,external_property_id,status,credential_secret_ref,provider_certified,enabled')
    .eq('organization_id', organizationId)
    .eq('id', connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('HOTEL_CHANNEL_CONNECTION_NOT_FOUND');
  if (clean(data.provider).toLowerCase() !== 'booking_com') throw new Error('HOTEL_CHANNEL_RESERVATION_PROVIDER_NOT_SUPPORTED');
  if (clean(data.status).toUpperCase() !== 'ACTIVE' || data.provider_certified !== true || data.enabled !== true) {
    throw new Error('HOTEL_CHANNEL_CONNECTION_NOT_CERTIFIED_ACTIVE');
  }
  if (!clean(data.external_property_id)) throw new Error('BOOKING_COM_EXTERNAL_PROPERTY_ID_REQUIRED');
  if (!clean(data.credential_secret_ref)) throw new Error('BOOKING_COM_CREDENTIAL_REFERENCE_REQUIRED');
  return data;
}

async function resolveGuest({ supabase, organizationId, reservation }) {
  const identity = reservation?.guest || reservation?.booker || null;
  if (!identity?.full_name) return null;
  const email = safeEmail(identity.email);
  const phone = clean(identity.phone) || null;

  if (email) {
    const { data, error } = await supabase.from('hotel_guests').select('id').eq('organization_id', organizationId).ilike('email', email).limit(1).maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }
  if (phone) {
    const { data, error } = await supabase.from('hotel_guests').select('id').eq('organization_id', organizationId).eq('phone', phone).limit(1).maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }

  const { data, error } = await supabase.from('hotel_guests').insert({
    organization_id: organizationId,
    full_name: clean(identity.full_name),
    email,
    phone,
    nationality: clean(identity.nationality) || null,
    notes: 'Created from governed Booking.com reservation ingest.',
    marketing_consent: false,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function existingBookingsForReservation({ supabase, organizationId, connectionId, externalReservationId }) {
  const { data, error } = await supabase
    .from('hotel_bookings')
    .select('id,channel_room_stay_id,status')
    .eq('organization_id', organizationId)
    .eq('channel_connection_id', connectionId)
    .eq('external_reservation_id', externalReservationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

function roomEventPayload(reservation, room) {
  return {
    contract: reservation.contract,
    provider: reservation.provider,
    endpoint_kind: reservation.endpoint_kind,
    event_type: reservation.event_type,
    external_property_id: reservation.external_property_id,
    external_reservation_id: reservation.external_reservation_id,
    reservation_ids: reservation.reservation_ids,
    last_modify_at: reservation.last_modify_at,
    total_amount: reservation.total_amount,
    currency_code: reservation.currency_code,
    guest: reservation.guest,
    booker: reservation.booker,
    room,
    payment_details_redacted: true,
    sensitive_payment_data_persisted: false,
  };
}

async function recordRoomEvents({ supabase, organizationId, connection, reservation, rooms }) {
  const events = [];
  for (const room of rooms) {
    const payload = roomEventPayload(reservation, room);
    const baseEventId = bookingComOtaExternalEventId(reservation);
    const event = await HotelChannelEvidenceRuntime.recordReservationEvent({
      supabase,
      organizationId,
      propertyId: connection.property_id,
      connectionId: connection.id,
      provider: 'booking_com',
      externalEventId: `${baseEventId}:${room.channel_room_stay_id}`,
      externalReservationId: reservation.external_reservation_id,
      eventType: reservation.event_type,
      eventVersion: reservation.event_version,
      normalizedPayload: payload,
    });
    events.push({ room, event });
  }
  return events;
}

async function recordCancellationEvents({ supabase, organizationId, connection, reservation, existingBookings }) {
  const events = [];
  const baseEventId = bookingComOtaExternalEventId(reservation);
  for (const booking of existingBookings) {
    const room = { channel_room_stay_id: booking.channel_room_stay_id, cancellation_without_room_payload: true };
    const event = await HotelChannelEvidenceRuntime.recordReservationEvent({
      supabase,
      organizationId,
      propertyId: connection.property_id,
      connectionId: connection.id,
      provider: 'booking_com',
      externalEventId: `${baseEventId}:${booking.channel_room_stay_id}`,
      externalReservationId: reservation.external_reservation_id,
      eventType: 'CANCEL',
      eventVersion: reservation.event_version,
      normalizedPayload: roomEventPayload(reservation, room),
    });
    events.push({ room, event, bookingId: booking.id });
  }
  return events;
}

function eventIds(events) {
  return events.map(({ event }) => event?.id).filter(Boolean);
}

function allAlreadyMatched(events) {
  return events.length > 0 && events.every(({ event }) => clean(event.status).toUpperCase() === 'RECONCILED' && event.booking_id);
}

function allProviderSettled(events) {
  return events.length > 0 && events.every(({ event }) => ['ACKNOWLEDGED', 'SUPERSEDED'].includes(clean(event.provider_ack_status).toUpperCase()));
}

async function applyCanonicalReservation({ supabase, organizationId, connection, reservation, rooms, guestId }) {
  const { data, error } = await supabase.rpc('hotel_apply_channel_reservation_guarded', {
    p_organization_id: organizationId,
    p_property_id: connection.property_id,
    p_connection_id: connection.id,
    p_external_reservation_id: reservation.external_reservation_id,
    p_event_type: reservation.event_type,
    p_guest_id: guestId,
    p_booking_reference: reservation.external_reservation_id,
    p_currency_code: reservation.currency_code,
    p_notes: `Booking.com ${reservation.event_type.toLowerCase()} event ${reservation.event_version || ''}`.trim(),
    p_rooms: rooms,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : (data ? [data] : []);
}

async function reconcileEvents({ supabase, organizationId, connection, events, bookings }) {
  const bookingByRoom = new Map(bookings.map((booking) => [clean(booking.channel_room_stay_id), booking]));
  for (const item of events) {
    const booking = item.bookingId
      ? bookings.find((candidate) => candidate.id === item.bookingId) || { id: item.bookingId, channel_room_stay_id: item.room.channel_room_stay_id }
      : bookingByRoom.get(clean(item.room.channel_room_stay_id));
    if (!booking?.id) throw new Error('HOTEL_CHANNEL_CANONICAL_BOOKING_NOT_RETURNED');
    if (clean(item.event.status).toUpperCase() === 'RECONCILED' && item.event.booking_id === booking.id) continue;
    await HotelChannelEvidenceRuntime.recordReconciliation({
      supabase,
      organizationId,
      propertyId: connection.property_id,
      connectionId: connection.id,
      reservationEventId: item.event.id,
      bookingId: booking.id,
      status: 'MATCHED',
      comparison: {
        external_reservation_id: item.event.external_reservation_id,
        channel_room_stay_id: item.room.channel_room_stay_id,
        canonical_booking_id: booking.id,
        provider: 'booking_com',
      },
    });
  }
}

async function pullLatestExactReservation({ organizationId, connection, transport, reservation }) {
  const latest = await transport.adapter.pullReservations({
    organizationId,
    credentialId: connection.credential_secret_ref,
    externalPropertyId: connection.external_property_id,
    externalReservationId: reservation.external_reservation_id,
    endpointKind: reservation.endpoint_kind,
  });
  const exact = (latest.reservations || []).find((candidate) => clean(candidate.external_reservation_id) === clean(reservation.external_reservation_id));
  if (!exact) throw new Error('BOOKING_COM_OTA_STALE_RESERVATION_CONVERGENCE_FAILED');
  return exact;
}

async function processReservation({ supabase, organizationId, connection, transport, reservation, staleAttempt = 0 }) {
  if (clean(reservation.external_property_id) && clean(reservation.external_property_id) !== clean(connection.external_property_id)) {
    throw new Error('BOOKING_COM_RESERVATION_PROPERTY_MISMATCH');
  }

  const rooms = normalizeRooms(reservation);
  let events;
  let existingBookings = [];
  if (reservation.event_type === 'CANCEL' && rooms.length === 0) {
    existingBookings = await existingBookingsForReservation({
      supabase,
      organizationId,
      connectionId: connection.id,
      externalReservationId: reservation.external_reservation_id,
    });
    if (!existingBookings.length) throw new Error('HOTEL_CHANNEL_BOOKING_NOT_FOUND_FOR_CANCEL');
    events = await recordCancellationEvents({ supabase, organizationId, connection, reservation, existingBookings });
  } else {
    if (!rooms.length) throw new Error('BOOKING_COM_RESERVATION_ROOMS_REQUIRED');
    events = await recordRoomEvents({ supabase, organizationId, connection, reservation, rooms });
  }

  if (!allAlreadyMatched(events)) {
    try {
      const guestId = reservation.event_type === 'CANCEL' ? null : await resolveGuest({ supabase, organizationId, reservation });
      const bookings = await applyCanonicalReservation({ supabase, organizationId, connection, reservation, rooms, guestId });
      const reconciliationBookings = reservation.event_type === 'CANCEL' && rooms.length === 0 ? existingBookings : bookings;
      await reconcileEvents({ supabase, organizationId, connection, events, bookings: reconciliationBookings });
    } catch (error) {
      await HotelChannelEvidenceRuntime.recordReservationProcessingFailure({
        supabase,
        organizationId,
        connectionId: connection.id,
        reservationEventIds: eventIds(events),
        errorCode: clean(error?.code) || clean(error?.message).split(':')[0] || 'HOTEL_CHANNEL_RESERVATION_PROCESSING_FAILED',
        errorMessage: clean(error?.message),
      });
      throw error;
    }
  }

  if (allProviderSettled(events)) {
    return {
      externalReservationId: reservation.external_reservation_id,
      eventType: reservation.event_type,
      roomCount: events.length,
      acknowledged: true,
      replaySettled: true,
      staleConvergenceAttempts: staleAttempt,
    };
  }

  try {
    await transport.adapter.acknowledgeReservation({
      organizationId,
      credentialId: connection.credential_secret_ref,
      endpointKind: reservation.endpoint_kind,
      reservationIds: reservation.reservation_ids,
    });
    await HotelChannelEvidenceRuntime.recordReservationProviderAcknowledgement({
      supabase,
      organizationId,
      connectionId: connection.id,
      reservationEventIds: eventIds(events),
      status: 'ACKNOWLEDGED',
      detail: { endpoint_kind: reservation.endpoint_kind, event_version: reservation.event_version, stale_attempt: staleAttempt },
    });
  } catch (error) {
    if (error?.code !== 'BOOKING_COM_OTA_ACK_STALE_RESERVATION') {
      await HotelChannelEvidenceRuntime.recordReservationProviderAcknowledgement({
        supabase,
        organizationId,
        connectionId: connection.id,
        reservationEventIds: eventIds(events),
        status: 'RETRY_REQUIRED',
        errorCode: clean(error?.code) || 'BOOKING_COM_OTA_ACK_FAILED',
        errorMessage: clean(error?.message),
        detail: { endpoint_kind: reservation.endpoint_kind, event_version: reservation.event_version, stale_attempt: staleAttempt },
      });
      throw error;
    }

    if (staleAttempt >= MAX_STALE_ACK_CONVERGENCE_ATTEMPTS) {
      await HotelChannelEvidenceRuntime.recordReservationProviderAcknowledgement({
        supabase,
        organizationId,
        connectionId: connection.id,
        reservationEventIds: eventIds(events),
        status: 'RETRY_REQUIRED',
        errorCode: 'BOOKING_COM_OTA_STALE_RESERVATION_CONVERGENCE_LIMIT',
        errorMessage: 'Booking.com reservation changed repeatedly before acknowledgement.',
        detail: { endpoint_kind: reservation.endpoint_kind, event_version: reservation.event_version, stale_attempt: staleAttempt },
      });
      throw new Error('BOOKING_COM_OTA_STALE_RESERVATION_CONVERGENCE_LIMIT');
    }

    const latestReservation = await pullLatestExactReservation({ organizationId, connection, transport, reservation });
    if (clean(latestReservation.event_version) === clean(reservation.event_version)) {
      await HotelChannelEvidenceRuntime.recordReservationProviderAcknowledgement({
        supabase,
        organizationId,
        connectionId: connection.id,
        reservationEventIds: eventIds(events),
        status: 'RETRY_REQUIRED',
        errorCode: 'BOOKING_COM_OTA_STALE_RESERVATION_VERSION_DID_NOT_ADVANCE',
        errorMessage: 'Booking.com reported a stale acknowledgement but returned the same reservation version.',
        detail: { endpoint_kind: reservation.endpoint_kind, event_version: reservation.event_version, stale_attempt: staleAttempt },
      });
      throw new Error('BOOKING_COM_OTA_STALE_RESERVATION_VERSION_DID_NOT_ADVANCE');
    }

    await HotelChannelEvidenceRuntime.recordReservationProviderAcknowledgement({
      supabase,
      organizationId,
      connectionId: connection.id,
      reservationEventIds: eventIds(events),
      status: 'SUPERSEDED',
      detail: {
        endpoint_kind: reservation.endpoint_kind,
        event_version: reservation.event_version,
        superseded_by_event_version: latestReservation.event_version,
        stale_attempt: staleAttempt,
      },
    });

    return processReservation({
      supabase,
      organizationId,
      connection,
      transport,
      reservation: latestReservation,
      staleAttempt: staleAttempt + 1,
    });
  }

  return {
    externalReservationId: reservation.external_reservation_id,
    eventType: reservation.event_type,
    roomCount: events.length,
    acknowledged: true,
    replaySettled: false,
    staleConvergenceAttempts: staleAttempt,
  };
}

export class HotelChannelReservationIngestRuntime {
  static async pullAndProcess({ supabase, organizationId, connectionId }) {
    if (!supabase || !clean(organizationId) || !clean(connectionId)) throw new Error('HOTEL_CHANNEL_RESERVATION_INGEST_CONTEXT_REQUIRED');
    const connection = await loadConnection({ supabase, organizationId, connectionId });
    const transport = requireHotelChannelTransport('booking_com');
    if (!transport?.adapter?.pullReservations || !transport?.adapter?.acknowledgeReservation) {
      throw new Error('BOOKING_COM_RESERVATION_TRANSPORT_NOT_IMPLEMENTED');
    }

    const processed = [];
    for (const endpointKind of ['NEW', 'MODIFY']) {
      const pull = await transport.adapter.pullReservations({
        organizationId,
        credentialId: connection.credential_secret_ref,
        externalPropertyId: connection.external_property_id,
        endpointKind,
      });
      for (const reservation of pull.reservations || []) {
        processed.push(await processReservation({ supabase, organizationId, connection, transport, reservation }));
      }
    }

    return {
      success: true,
      provider: 'booking_com',
      connectionId: connection.id,
      processedCount: processed.length,
      processed,
    };
  }
}

export default HotelChannelReservationIngestRuntime;
