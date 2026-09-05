import { resolveProviderCredential } from '@/lib/platform/service-runtime/providers/ProviderCredentialRuntime';

const TOKEN_URL = 'https://connectivity-authentication.booking.com/token-based-authentication/exchange';
const AVAILABILITY_URL = 'https://supply-xml.booking.com/hotels/xml/availability';

function clean(value) {
  return String(value ?? '').trim();
}

function xml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function requireNumericId(value, label) {
  const id = clean(value);
  if (!/^\d+$/.test(id)) throw new Error(`BOOKING_COM_${label}_ID_INVALID`);
  return id;
}

function decimal(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`BOOKING_COM_${label}_INVALID`);
  return number.toFixed(2);
}

function integer(value, label, minimum = 0) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) throw new Error(`BOOKING_COM_${label}_INVALID`);
  return number;
}

function boolFlag(value) {
  return value ? '1' : '0';
}

function normalizeRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('BOOKING_COM_ARI_ROWS_REQUIRED');
  if (rows.length > 31) throw new Error('BOOKING_COM_ARI_MONTHLY_BATCH_LIMIT_EXCEEDED');
  return [...rows].sort((a, b) => String(a.stay_date).localeCompare(String(b.stay_date)));
}

export function buildBookingComAvailabilityXml({
  externalRoomTypeId,
  externalRatePlanId,
  currencyCode,
  rows,
} = {}) {
  const roomId = requireNumericId(externalRoomTypeId, 'ROOM_TYPE');
  const rateId = requireNumericId(externalRatePlanId, 'RATE_PLAN');
  const currency = clean(currencyCode).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('BOOKING_COM_CURRENCY_INVALID');

  const orderedRows = normalizeRows(rows);
  const inventory = orderedRows
    .filter((row) => row.inventory !== null && row.inventory !== undefined)
    .map((row) => {
      const stayDate = clean(row.stay_date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(stayDate)) throw new Error('BOOKING_COM_STAY_DATE_INVALID');
      return `<room id="${roomId}"><date value="${stayDate}"><roomstosell>${integer(row.inventory, 'INVENTORY')}</roomstosell></date></room>`;
    })
    .join('');

  const rates = orderedRows.map((row) => {
    const stayDate = clean(row.stay_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stayDate)) throw new Error('BOOKING_COM_STAY_DATE_INVALID');
    const minimumStay = integer(row.min_stay ?? 1, 'MINIMUM_STAY', 1);
    const maximumStay = row.max_stay === null || row.max_stay === undefined
      ? ''
      : `<maximumstay>${integer(row.max_stay, 'MAXIMUM_STAY', minimumStay)}</maximumstay>`;
    return `<room id="${roomId}"><date value="${stayDate}"><currencycode>${currency}</currencycode><rate id="${rateId}"/><price>${decimal(row.rate_amount, 'PRICE')}</price><closed>${boolFlag(row.stop_sell)}</closed><minimumstay>${minimumStay}</minimumstay>${maximumStay}<closedonarrival>${boolFlag(row.closed_to_arrival)}</closedonarrival><closedondeparture>${boolFlag(row.closed_to_departure)}</closedondeparture></date></room>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?><request>${inventory}${rates}</request>`;
}

export function parseBookingComAvailabilityResponse(body, httpStatus = 200) {
  const text = String(body || '');
  const ruid = text.match(/<ruid>([^<]+)<\/ruid>/i)?.[1]?.trim() || null;
  const error = text.match(/<error[^>]*>([\s\S]*?)<\/error>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
  const success = Number(httpStatus) >= 200 && Number(httpStatus) < 300 && /<ok\s*\/?\s*>/i.test(text) && !error;
  return {
    success,
    status: success ? 'ACKNOWLEDGED' : (Number(httpStatus) >= 400 ? 'FAILED' : 'REJECTED'),
    providerReference: ruid,
    providerAckCode: success ? 'BXML_OK' : `HTTP_${Number(httpStatus) || 0}`,
    error: error ? error.slice(0, 500) : (success ? null : 'Booking.com did not return an unambiguous <ok> acknowledgement.'),
  };
}

export async function getBookingComBearerToken({ organizationId, credentialId, fetchImpl = fetch } = {}) {
  const credential = await resolveProviderCredential({
    organization_id: organizationId,
    provider: 'booking_com',
    credential_id: credentialId,
  });
  const clientId = clean(credential?.client_id);
  const clientSecret = clean(credential?.client_secret);
  if (!clientId || !clientSecret) throw new Error('BOOKING_COM_TOKEN_CREDENTIALS_REQUIRED');

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  const token = clean(payload?.jwt);
  if (!response.ok || !token) throw new Error(`BOOKING_COM_TOKEN_EXCHANGE_FAILED:${response.status}`);
  return { token, ruid: clean(payload?.ruid) || null };
}

export async function sendBookingComAvailability({
  organizationId,
  credentialId,
  externalRoomTypeId,
  externalRatePlanId,
  currencyCode,
  rows,
  fetchImpl = fetch,
} = {}) {
  const { token } = await getBookingComBearerToken({ organizationId, credentialId, fetchImpl });
  const body = buildBookingComAvailabilityXml({ externalRoomTypeId, externalRatePlanId, currencyCode, rows });
  const response = await fetchImpl(AVAILABILITY_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'accept-version': '1.1',
      'content-type': 'application/xml',
      accept: 'application/xml',
    },
    body,
    cache: 'no-store',
  });
  const responseBody = await response.text();
  return {
    requestItemCount: Array.isArray(rows) ? rows.length : 0,
    ...parseBookingComAvailabilityResponse(responseBody, response.status),
  };
}

export const BookingComTransport = Object.freeze({
  provider: 'booking_com',
  contract: 'BOOKING_COM_BXML_AVAILABILITY_V1_1_TOKEN_AUTH',
  tokenAuthentication: true,
  outboundARI: true,
  reservationsPullAck: false,
  sendAvailability: sendBookingComAvailability,
});

export default BookingComTransport;
