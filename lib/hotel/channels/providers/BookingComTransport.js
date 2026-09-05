import { resolveProviderCredential } from '@/lib/platform/service-runtime/providers/ProviderCredentialRuntime';
import {
  buildBookingComOtaAcknowledgement,
  parseBookingComOtaReservations,
} from '@/lib/hotel/channels/providers/BookingComOtaReservations';

const TOKEN_URL = 'https://connectivity-authentication.booking.com/token-based-authentication/exchange';
const AVAILABILITY_URL = 'https://supply-xml.booking.com/hotels/xml/availability';
const RESERVATION_URL = 'https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResNotif';
const RESERVATION_MODIFY_URL = 'https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResModifyNotif';
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000;
const tokenCache = new Map();

function clean(value) {
  return String(value ?? '').trim();
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

function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`BOOKING_COM_${label}_INVALID`);
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
      return `<room id="${roomId}"><date value="${stayDate}"><roomstosell>${integer(row.inventory, 'INVENTORY', 0, 255)}</roomstosell></date></room>`;
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
  const ruid = text.match(/<ruid>([^<]+)<\/ruid>/i)?.[1]?.trim()
    || text.match(/RUID\s*:\s*\[([^\]]+)\]/i)?.[1]?.trim()
    || null;
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

function tokenCacheKey(organizationId, credentialId) {
  return `${clean(organizationId)}:${clean(credentialId)}`;
}

function clearBookingComToken(organizationId, credentialId) {
  tokenCache.delete(tokenCacheKey(organizationId, credentialId));
}

export async function getBookingComBearerToken({ organizationId, credentialId, fetchImpl = fetch, forceRefresh = false } = {}) {
  const cacheKey = tokenCacheKey(organizationId, credentialId);
  const cached = tokenCache.get(cacheKey);
  if (!forceRefresh && cached?.token && cached.expiresAt > Date.now()) return cached;

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
  const value = { token, ruid: clean(payload?.ruid) || null, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS };
  tokenCache.set(cacheKey, value);
  return value;
}

async function bookingComAuthenticatedFetch({ organizationId, credentialId, url, init, fetchImpl = fetch } = {}) {
  let { token } = await getBookingComBearerToken({ organizationId, credentialId, fetchImpl });
  let response = await fetchImpl(url, {
    ...init,
    headers: { ...(init?.headers || {}), authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (response.status !== 401) return response;

  clearBookingComToken(organizationId, credentialId);
  ({ token } = await getBookingComBearerToken({ organizationId, credentialId, fetchImpl, forceRefresh: true }));
  response = await fetchImpl(url, {
    ...init,
    headers: { ...(init?.headers || {}), authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return response;
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
  const body = buildBookingComAvailabilityXml({ externalRoomTypeId, externalRatePlanId, currencyCode, rows });
  const response = await bookingComAuthenticatedFetch({
    organizationId,
    credentialId,
    url: AVAILABILITY_URL,
    fetchImpl,
    init: {
      method: 'POST',
      headers: {
        'accept-version': '1.1',
        'content-type': 'application/xml',
        accept: 'application/xml',
      },
      body,
    },
  });
  const responseBody = await response.text();
  return {
    requestItemCount: Array.isArray(rows) ? rows.length : 0,
    ...parseBookingComAvailabilityResponse(responseBody, response.status),
  };
}

function reservationEndpoint(endpointKind) {
  const kind = clean(endpointKind).toUpperCase();
  if (kind === 'NEW') return RESERVATION_URL;
  if (kind === 'MODIFY') return RESERVATION_MODIFY_URL;
  throw new Error('BOOKING_COM_OTA_ENDPOINT_KIND_INVALID');
}

export async function pullBookingComReservations({
  organizationId,
  credentialId,
  externalPropertyId,
  externalReservationId = null,
  endpointKind = 'NEW',
  fetchImpl = fetch,
} = {}) {
  const propertyId = requireNumericId(externalPropertyId, 'PROPERTY');
  const kind = clean(endpointKind).toUpperCase();
  const url = new URL(reservationEndpoint(kind));
  url.searchParams.set('hotel_ids', propertyId);
  if (clean(externalReservationId)) url.searchParams.set('id', clean(externalReservationId));
  const response = await bookingComAuthenticatedFetch({
    organizationId,
    credentialId,
    url: url.toString(),
    fetchImpl,
    init: { method: 'GET', headers: { accept: 'application/xml' } },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`BOOKING_COM_OTA_PULL_FAILED:${kind}:${response.status}`);
  if (/<Errors?>\b|<Error\b/i.test(body)) throw new Error(`BOOKING_COM_OTA_PULL_PROVIDER_ERROR:${kind}`);
  const reservations = parseBookingComOtaReservations(body, kind);
  if (clean(externalReservationId) && !reservations.some((reservation) => clean(reservation.external_reservation_id) === clean(externalReservationId))) {
    throw new Error(`BOOKING_COM_OTA_TARGET_RESERVATION_NOT_RETURNED:${kind}`);
  }
  return { endpointKind: kind, reservations };
}

export async function acknowledgeBookingComReservation({
  organizationId,
  credentialId,
  endpointKind = 'NEW',
  reservationIds,
  fetchImpl = fetch,
} = {}) {
  const kind = clean(endpointKind).toUpperCase();
  const body = buildBookingComOtaAcknowledgement({ endpointKind: kind, reservationIds, success: true });
  const response = await bookingComAuthenticatedFetch({
    organizationId,
    credentialId,
    url: reservationEndpoint(kind),
    fetchImpl,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/xml', accept: 'application/xml' },
      body,
    },
  });
  const responseBody = await response.text();
  if (response.status === 409 || response.status === 400 && /wrong type|no longer the latest|latest/i.test(responseBody)) {
    const stale = new Error(`BOOKING_COM_OTA_ACK_STALE_RESERVATION:${kind}:${response.status}`);
    stale.code = 'BOOKING_COM_OTA_ACK_STALE_RESERVATION';
    stale.httpStatus = response.status;
    throw stale;
  }
  const providerError = /<Errors?>\b|<Error\b/i.test(responseBody);
  const explicitSuccess = /<Success\s*\/?\s*>/i.test(responseBody);
  if (!response.ok || providerError || !explicitSuccess) throw new Error(`BOOKING_COM_OTA_ACK_FAILED:${kind}:${response.status}`);
  return { acknowledged: true, endpointKind: kind, httpStatus: response.status };
}

export const BookingComTransport = Object.freeze({
  provider: 'booking_com',
  contract: 'BOOKING_COM_BXML_ARI_AND_OTA_RESERVATIONS_TOKEN_AUTH',
  tokenAuthentication: true,
  outboundARI: true,
  reservationsPullAck: true,
  sendAvailability: sendBookingComAvailability,
  pullReservations: pullBookingComReservations,
  acknowledgeReservation: acknowledgeBookingComReservation,
});

export default BookingComTransport;
