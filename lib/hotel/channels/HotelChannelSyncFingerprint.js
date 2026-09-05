import { createHash } from 'node:crypto';

function normalizedNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function canonicalHotelRateDistributionRows(rows = []) {
  return [...(rows || [])]
    .map((row) => ({
      rate_plan_id: String(row?.rate_plan_id || ''),
      room_type: String(row?.room_type || ''),
      stay_date: String(row?.stay_date || ''),
      rate_amount: normalizedNumber(row?.rate_amount),
      inventory: normalizedNumber(row?.inventory),
      min_stay: normalizedNumber(row?.min_stay),
      max_stay: normalizedNumber(row?.max_stay),
      stop_sell: Boolean(row?.stop_sell),
      closed_to_arrival: Boolean(row?.closed_to_arrival),
      closed_to_departure: Boolean(row?.closed_to_departure),
    }))
    .sort((a, b) => a.stay_date.localeCompare(b.stay_date));
}

export function hotelRateDistributionFingerprint(rows = []) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalHotelRateDistributionRows(rows)))
    .digest('hex');
}

export default hotelRateDistributionFingerprint;
