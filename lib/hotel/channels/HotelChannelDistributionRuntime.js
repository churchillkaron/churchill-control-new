import { HotelChannelEvidenceRuntime } from '@/lib/hotel/channels/HotelChannelEvidenceRuntime';
import { hotelRateDistributionFingerprint } from '@/lib/hotel/channels/HotelChannelSyncFingerprint';
import { requireHotelChannelTransport } from '@/lib/hotel/channels/HotelChannelTransportRegistry';

function clean(value) {
  return String(value ?? '').trim();
}

function monthKey(stayDate) {
  return clean(stayDate).slice(0, 7);
}

function groupByMonth(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = monthKey(row.stay_date);
    if (!/^\d{4}-\d{2}$/.test(key)) throw new Error('HOTEL_CHANNEL_STAY_MONTH_INVALID');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function loadJob({ supabase, organizationId, jobId }) {
  const { data, error } = await supabase
    .from('hotel_channel_sync_jobs')
    .select('id,organization_id,property_id,connection_id,sync_type,status,date_from,date_to,change_summary,request_fingerprint,provider_reference,attempt_count,last_error,queued_at,started_at,completed_at')
    .eq('id', jobId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('HOTEL_CHANNEL_SYNC_JOB_NOT_FOUND');
  if (data.sync_type !== 'RATE_INVENTORY_DISTRIBUTION') throw new Error('HOTEL_CHANNEL_SYNC_JOB_TYPE_UNSUPPORTED');
  if (!data.connection_id) throw new Error('HOTEL_CHANNEL_SYNC_JOB_HAS_NO_PROVIDER_CONNECTION');
  if (!['PENDING', 'FAILED'].includes(clean(data.status).toUpperCase())) throw new Error(`HOTEL_CHANNEL_SYNC_JOB_NOT_DISPATCHABLE:${data.status}`);
  return data;
}

async function loadConnection({ supabase, organizationId, job }) {
  const { data, error } = await supabase
    .from('hotel_channel_connections')
    .select('id,organization_id,property_id,provider,external_property_id,status,credential_secret_ref,provider_certified,enabled')
    .eq('id', job.connection_id)
    .eq('organization_id', organizationId)
    .eq('property_id', job.property_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('HOTEL_CHANNEL_CONNECTION_NOT_FOUND');
  if (data.status !== 'ACTIVE' || data.provider_certified !== true || data.enabled !== true) throw new Error('HOTEL_CHANNEL_CONNECTION_NOT_CERTIFIED_ACTIVE');
  if (!clean(data.credential_secret_ref)) throw new Error('HOTEL_CHANNEL_CREDENTIAL_REFERENCE_REQUIRED');
  return data;
}

async function loadCanonicalRows({ supabase, organizationId, job }) {
  const ratePlanId = clean(job.change_summary?.rate_plan_id);
  const roomType = clean(job.change_summary?.room_type);
  if (!ratePlanId || !roomType || !job.date_from || !job.date_to) throw new Error('HOTEL_CHANNEL_SYNC_JOB_SCOPE_INCOMPLETE');

  const [{ data: rows, error: rowsError }, { data: plan, error: planError }, { data: mapping, error: mappingError }] = await Promise.all([
    supabase
      .from('hotel_rate_calendar')
      .select('rate_plan_id,room_type,stay_date,rate_amount,inventory,min_stay,max_stay,stop_sell,closed_to_arrival,closed_to_departure')
      .eq('organization_id', organizationId)
      .eq('property_id', job.property_id)
      .eq('rate_plan_id', ratePlanId)
      .eq('room_type', roomType)
      .gte('stay_date', job.date_from)
      .lte('stay_date', job.date_to)
      .order('stay_date', { ascending: true }),
    supabase
      .from('hotel_rate_plans')
      .select('id,currency_code,active')
      .eq('organization_id', organizationId)
      .eq('property_id', job.property_id)
      .eq('id', ratePlanId)
      .maybeSingle(),
    supabase
      .from('hotel_channel_mappings')
      .select('id,external_room_type_id,external_rate_plan_id,active')
      .eq('organization_id', organizationId)
      .eq('connection_id', job.connection_id)
      .eq('local_room_type', roomType)
      .eq('local_rate_plan_id', ratePlanId)
      .eq('active', true)
      .maybeSingle(),
  ]);
  if (rowsError) throw rowsError;
  if (planError) throw planError;
  if (mappingError) throw mappingError;
  if (!plan?.active) throw new Error('HOTEL_CHANNEL_RATE_PLAN_NOT_ACTIVE');
  if (!mapping?.external_room_type_id || !mapping?.external_rate_plan_id) throw new Error('HOTEL_CHANNEL_EXACT_MAPPING_REQUIRED');
  if (!(rows || []).length) throw new Error('HOTEL_CHANNEL_CANONICAL_RATE_ROWS_MISSING');

  const expectedEntries = Number(job.change_summary?.entries || 0);
  if (expectedEntries && rows.length !== expectedEntries) throw new Error('HOTEL_CHANNEL_CANONICAL_ROW_COUNT_CHANGED');
  const currentFingerprint = hotelRateDistributionFingerprint(rows);
  if (!job.request_fingerprint || currentFingerprint !== job.request_fingerprint) throw new Error('HOTEL_CHANNEL_CANONICAL_STATE_CHANGED_AFTER_QUEUE');

  return { rows, plan, mapping, currentFingerprint };
}

async function markJob({ supabase, organizationId, jobId, patch }) {
  const { error } = await supabase
    .from('hotel_channel_sync_jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('organization_id', organizationId);
  if (error) throw error;
}

export class HotelChannelDistributionRuntime {
  static async dispatchRateInventoryJob({ supabase, organizationId, jobId, fetchImpl = fetch } = {}) {
    if (!supabase || !organizationId || !jobId) throw new Error('HOTEL_CHANNEL_DISPATCH_SCOPE_REQUIRED');
    const job = await loadJob({ supabase, organizationId, jobId });
    const connection = await loadConnection({ supabase, organizationId, job });
    const transport = requireHotelChannelTransport(connection.provider);
    const { rows, plan, mapping, currentFingerprint } = await loadCanonicalRows({ supabase, organizationId, job });

    if (connection.provider === 'booking_com' && rows.some((row) => row.inventory === null || row.inventory === undefined)) {
      throw new Error('BOOKING_COM_EXPLICIT_OR_DERIVED_INVENTORY_REQUIRED_BEFORE_TRANSMISSION');
    }

    const now = new Date().toISOString();
    await markJob({
      supabase,
      organizationId,
      jobId,
      patch: { status: 'RUNNING', started_at: now, attempt_count: Number(job.attempt_count || 0) + 1, last_error: null },
    });

    const results = [];
    try {
      for (const [month, monthRows] of groupByMonth(rows)) {
        const idempotencyKey = `${job.id}:${currentFingerprint}:${month}`;
        const transmission = await HotelChannelEvidenceRuntime.recordTransmission({
          supabase,
          organizationId,
          propertyId: job.property_id,
          connectionId: job.connection_id,
          syncJobId: job.id,
          provider: connection.provider,
          idempotencyKey,
          transmissionType: 'ARI',
          status: 'SENT',
          changeSummary: { ...job.change_summary, month, request_fingerprint: currentFingerprint },
          itemCount: monthRows.length,
          dateFrom: monthRows[0]?.stay_date || null,
          dateTo: monthRows[monthRows.length - 1]?.stay_date || null,
        });

        const response = await transport.adapter.sendAvailability({
          organizationId,
          credentialId: connection.credential_secret_ref,
          externalRoomTypeId: mapping.external_room_type_id,
          externalRatePlanId: mapping.external_rate_plan_id,
          currencyCode: plan.currency_code,
          rows: monthRows,
          fetchImpl,
        });

        const acknowledgement = await HotelChannelEvidenceRuntime.recordAcknowledgement({
          supabase,
          organizationId,
          connectionId: job.connection_id,
          transmissionId: transmission.id,
          status: response.status,
          providerAckCode: response.providerAckCode,
          providerAckSummary: {
            contract: transport.adapter.contract,
            month,
            item_count: monthRows.length,
            response_reference_present: Boolean(response.providerReference),
          },
          providerMessageId: response.providerReference,
          errorCode: response.success ? null : response.providerAckCode,
          errorMessage: response.error,
        });
        results.push({ transmissionId: acknowledgement.id, month, status: acknowledgement.status, providerReference: response.providerReference || null });
        if (!response.success) throw new Error(`HOTEL_CHANNEL_PROVIDER_REJECTED:${response.error || response.providerAckCode}`);
      }

      const completedAt = new Date().toISOString();
      const providerReference = results.map((result) => result.providerReference).filter(Boolean).join(',').slice(0, 1000) || null;
      await markJob({
        supabase,
        organizationId,
        jobId,
        patch: { status: 'COMPLETED', provider_reference: providerReference, completed_at: completedAt, last_error: null },
      });
      await supabase
        .from('hotel_channel_connections')
        .update({ last_sync_at: completedAt, last_success_at: completedAt, last_error: null, updated_at: completedAt })
        .eq('id', job.connection_id)
        .eq('organization_id', organizationId);

      return { success: true, jobId, provider: connection.provider, fingerprint: currentFingerprint, batches: results };
    } catch (error) {
      const failedAt = new Date().toISOString();
      await markJob({
        supabase,
        organizationId,
        jobId,
        patch: { status: 'FAILED', last_error: clean(error?.message).slice(0, 1000), completed_at: failedAt },
      }).catch(() => {});
      await supabase
        .from('hotel_channel_connections')
        .update({ last_sync_at: failedAt, last_error: clean(error?.message).slice(0, 1000), updated_at: failedAt })
        .eq('id', job.connection_id)
        .eq('organization_id', organizationId)
        .then(() => {}, () => {});
      throw error;
    }
  }
}

export default HotelChannelDistributionRuntime;
