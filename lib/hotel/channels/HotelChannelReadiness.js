function hasStatus(row, status) {
  return String(row?.status || '').toUpperCase() === status;
}

export function buildHotelChannelReadiness({
  connection,
  mappingCount = 0,
  transportImplemented = false,
  latestTransmission = null,
  latestReservationEvent = null,
  latestReconciliation = null,
} = {}) {
  if (!connection) {
    return {
      live: false,
      code: 'NOT_CONNECTED',
      label: 'Not connected',
      blockers: ['Create the provider setup record.'],
      checks: {
        credentials: false,
        mapping: false,
        certification: false,
        enabled: false,
        transportImplemented: false,
        transmissionAcknowledged: false,
        reservationIngested: false,
        reservationReconciled: false,
      },
    };
  }

  const checks = {
    credentials: Boolean(connection.credential_configured),
    mapping: Boolean(connection.external_property_id) && Number(mappingCount) > 0,
    certification: Boolean(connection.provider_certified),
    enabled: Boolean(connection.enabled),
    transportImplemented: Boolean(transportImplemented),
    transmissionAcknowledged: hasStatus(latestTransmission, 'ACKNOWLEDGED'),
    reservationIngested: Boolean(latestReservationEvent),
    reservationReconciled: hasStatus(latestReconciliation, 'MATCHED'),
  };

  const blockers = [];
  if (!checks.credentials) blockers.push('Certified provider credentials are not configured.');
  if (!checks.mapping) blockers.push('Property plus room/rate-plan mapping is incomplete.');
  if (!checks.certification) blockers.push('Provider connectivity certification is not recorded.');
  if (!checks.enabled) blockers.push('Distribution is not enabled.');
  if (!checks.transportImplemented) blockers.push('Avantiqo does not yet have a certified transport adapter for this provider.');
  if (!latestTransmission) blockers.push('No outbound ARI transmission evidence exists.');
  else if (hasStatus(latestTransmission, 'FAILED') || hasStatus(latestTransmission, 'REJECTED')) blockers.push('Latest outbound ARI transmission failed or was rejected.');
  else if (!checks.transmissionAcknowledged) blockers.push('Provider acknowledgement is still missing.');
  if (!checks.reservationIngested) blockers.push('No certified reservation-ingest evidence exists.');
  if (checks.reservationIngested && !checks.reservationReconciled) blockers.push('Latest reservation evidence has not reconciled to a canonical Hotel booking.');

  const live = checks.credentials
    && checks.mapping
    && checks.certification
    && checks.enabled
    && checks.transportImplemented
    && checks.transmissionAcknowledged
    && checks.reservationIngested
    && checks.reservationReconciled;

  let code = 'READY';
  if (!checks.credentials) code = 'CREDENTIALS_REQUIRED';
  else if (!checks.mapping) code = 'MAPPING_REQUIRED';
  else if (!checks.certification) code = 'CERTIFICATION_REQUIRED';
  else if (!checks.enabled) code = 'ENABLE_REQUIRED';
  else if (!checks.transportImplemented) code = 'TRANSPORT_REQUIRED';
  else if (!latestTransmission) code = 'TRANSMISSION_REQUIRED';
  else if (hasStatus(latestTransmission, 'FAILED') || hasStatus(latestTransmission, 'REJECTED')) code = 'TRANSMISSION_FAILED';
  else if (!checks.transmissionAcknowledged) code = 'ACKNOWLEDGEMENT_REQUIRED';
  else if (!checks.reservationIngested) code = 'RESERVATION_INGEST_REQUIRED';
  else if (!checks.reservationReconciled) code = 'RECONCILIATION_REQUIRED';
  else if (live) code = 'LIVE';

  const labels = {
    CREDENTIALS_REQUIRED: 'Credentials required',
    MAPPING_REQUIRED: 'Mapping required',
    CERTIFICATION_REQUIRED: 'Certification required',
    ENABLE_REQUIRED: 'Enable required',
    TRANSPORT_REQUIRED: 'Transport adapter required',
    TRANSMISSION_REQUIRED: 'ARI proof required',
    TRANSMISSION_FAILED: 'Transmission failed',
    ACKNOWLEDGEMENT_REQUIRED: 'ACK required',
    RESERVATION_INGEST_REQUIRED: 'Reservation proof required',
    RECONCILIATION_REQUIRED: 'Reconciliation required',
    LIVE: 'Certified live',
    READY: 'Verification required',
  };

  return { live, code, label: labels[code] || code, blockers, checks };
}

export default buildHotelChannelReadiness;
