import { createHash } from 'node:crypto';

import { getHotelChannelProvider } from '@/lib/hotel/channels/HotelChannelProviderRegistry';

function clean(value) {
  return String(value ?? '').trim();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function hotelChannelEvidenceFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value ?? {}))).digest('hex');
}

async function requireConnection({ supabase, organizationId, propertyId, connectionId, provider }) {
  const { data, error } = await supabase
    .from('hotel_channel_connections')
    .select('id,organization_id,property_id,provider')
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .eq('property_id', propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Hotel channel connection not found for this organization/property');
  if (provider && data.provider !== provider) throw new Error('Hotel channel provider does not match the connection');
  if (!getHotelChannelProvider(data.provider)) throw new Error('Unsupported Hotel channel provider');
  return data;
}

export class HotelChannelEvidenceRuntime {
  static async recordTransmission({
    supabase,
    organizationId,
    propertyId,
    connectionId,
    syncJobId = null,
    provider,
    idempotencyKey,
    transmissionType = 'ARI',
    status = 'SENT',
    changeSummary = {},
    itemCount = 0,
    dateFrom = null,
    dateTo = null,
    providerMessageId = null,
  }) {
    const normalizedProvider = clean(provider).toLowerCase();
    const key = clean(idempotencyKey);
    const normalizedStatus = clean(status).toUpperCase() || 'SENT';
    if (!['QUEUED', 'SENT'].includes(normalizedStatus)) throw new Error('New Hotel channel transmission evidence must start as QUEUED or SENT');
    if (!supabase || !organizationId || !propertyId || !connectionId || !normalizedProvider || !key) {
      throw new Error('Hotel channel transmission requires supabase, organization, property, connection, provider and idempotency key');
    }
    await requireConnection({ supabase, organizationId, propertyId, connectionId, provider: normalizedProvider });
    const requestFingerprint = hotelChannelEvidenceFingerprint({ transmissionType, changeSummary, itemCount, dateFrom, dateTo });
    const row = {
      organization_id: organizationId,
      property_id: propertyId,
      connection_id: connectionId,
      sync_job_id: syncJobId,
      provider: normalizedProvider,
      idempotency_key: key,
      transmission_type: clean(transmissionType).toUpperCase() || 'ARI',
      status: normalizedStatus,
      request_fingerprint: requestFingerprint,
      change_summary: changeSummary || {},
      item_count: Math.max(0, Number(itemCount) || 0),
      date_from: dateFrom,
      date_to: dateTo,
      provider_message_id: clean(providerMessageId) || null,
      sent_at: normalizedStatus === 'SENT' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('hotel_channel_transmissions').insert(row).select().single();
    if (!error) return data;
    if (error.code !== '23505') throw error;

    const { data: existing, error: existingError } = await supabase
      .from('hotel_channel_transmissions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('connection_id', connectionId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw error;
    if (existing.request_fingerprint !== requestFingerprint) throw new Error('Hotel channel idempotency key was reused for different transmission content');
    return existing;
  }

  static async recordAcknowledgement({
    supabase,
    organizationId,
    connectionId,
    transmissionId,
    status,
    providerAckCode = null,
    providerAckSummary = {},
    providerMessageId = null,
    errorCode = null,
    errorMessage = null,
  }) {
    const normalizedStatus = clean(status).toUpperCase();
    if (!['ACKNOWLEDGED', 'REJECTED', 'FAILED'].includes(normalizedStatus)) throw new Error('Invalid Hotel channel acknowledgement status');

    const { data: existing, error: existingError } = await supabase
      .from('hotel_channel_transmissions')
      .select('*')
      .eq('id', transmissionId)
      .eq('organization_id', organizationId)
      .eq('connection_id', connectionId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw new Error('Hotel channel transmission not found');

    const currentStatus = clean(existing.status).toUpperCase();
    const terminal = ['ACKNOWLEDGED', 'REJECTED', 'FAILED'];
    if (terminal.includes(currentStatus)) {
      if (currentStatus === normalizedStatus) return existing;
      throw new Error(`Hotel channel transmission is already terminal as ${currentStatus}`);
    }

    const now = new Date().toISOString();
    const patch = {
      status: normalizedStatus,
      provider_ack_code: clean(providerAckCode) || null,
      provider_ack_summary: providerAckSummary || {},
      provider_message_id: clean(providerMessageId) || existing.provider_message_id || null,
      error_code: clean(errorCode) || null,
      error_message: clean(errorMessage) || null,
      acknowledged_at: normalizedStatus === 'ACKNOWLEDGED' ? now : null,
      failed_at: normalizedStatus === 'ACKNOWLEDGED' ? null : now,
      updated_at: now,
    };
    const { data, error } = await supabase
      .from('hotel_channel_transmissions')
      .update(patch)
      .eq('id', transmissionId)
      .eq('organization_id', organizationId)
      .eq('connection_id', connectionId)
      .eq('status', existing.status)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Hotel channel acknowledgement lost a concurrent terminal-state race');
    return data;
  }

  static async recordReservationEvent({
    supabase,
    organizationId,
    propertyId,
    connectionId,
    provider,
    externalEventId,
    externalReservationId,
    eventType,
    eventVersion = null,
    normalizedPayload = {},
  }) {
    const normalizedProvider = clean(provider).toLowerCase();
    const eventId = clean(externalEventId);
    const reservationId = clean(externalReservationId);
    if (!eventId || !reservationId) throw new Error('OTA reservation event requires external event and reservation ids');
    await requireConnection({ supabase, organizationId, propertyId, connectionId, provider: normalizedProvider });
    const payloadFingerprint = hotelChannelEvidenceFingerprint(normalizedPayload);
    const row = {
      organization_id: organizationId,
      property_id: propertyId,
      connection_id: connectionId,
      provider: normalizedProvider,
      external_event_id: eventId,
      external_reservation_id: reservationId,
      event_type: clean(eventType).toUpperCase() || 'UPSERT',
      event_version: clean(eventVersion) || null,
      status: 'NORMALIZED',
      payload_fingerprint: payloadFingerprint,
      normalized_payload: normalizedPayload || {},
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('hotel_channel_reservation_events').insert(row).select().single();
    if (!error) return data;
    if (error.code !== '23505') throw error;

    const { data: existing, error: existingError } = await supabase
      .from('hotel_channel_reservation_events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('provider', normalizedProvider)
      .eq('external_event_id', eventId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw error;
    if (existing.payload_fingerprint !== payloadFingerprint) throw new Error('OTA provider event id was reused for different reservation content');
    return existing;
  }

  static async recordReconciliation({
    supabase,
    organizationId,
    propertyId,
    connectionId,
    reservationEventId,
    bookingId = null,
    status,
    comparison = {},
    reconciledBy = null,
  }) {
    const normalizedStatus = clean(status).toUpperCase();
    if (!['MATCHED', 'MISMATCH', 'MANUAL_REVIEW'].includes(normalizedStatus)) throw new Error('Invalid Hotel reservation reconciliation status');

    const { data, error } = await supabase.rpc('hotel_reconcile_channel_reservation_event', {
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_connection_id: connectionId,
      p_reservation_event_id: reservationEventId,
      p_booking_id: bookingId,
      p_status: normalizedStatus,
      p_comparison: comparison || {},
      p_reconciled_by: reconciledBy,
    });
    if (error) throw error;
    if (!data?.id) throw new Error('Hotel reservation reconciliation did not return evidence');
    return data;
  }
}

export default HotelChannelEvidenceRuntime;
