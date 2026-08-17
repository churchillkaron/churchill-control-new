const RECURRENCE_PRESETS = Object.freeze({
  weekly: Object.freeze({ interval: 1, unit: "week" }),
  biweekly: Object.freeze({ interval: 2, unit: "week" }),
  monthly: Object.freeze({ interval: 1, unit: "month" }),
  quarterly: Object.freeze({ interval: 3, unit: "month" }),
  yearly: Object.freeze({ interval: 1, unit: "year" }),
});

const ALLOWED_UNITS = new Set(["day", "week", "month", "year"]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function positiveInteger(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function isoOrNull(value) {
  const normalized = text(value);
  if (!normalized) return null;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function normalizeServiceRecurrence(input = {}) {
  const preset = text(input.preset)?.toLowerCase() || "monthly";
  const configured = RECURRENCE_PRESETS[preset] || null;
  const requestedUnit = text(input.unit)?.toLowerCase();
  const unit = configured?.unit || (ALLOWED_UNITS.has(requestedUnit) ? requestedUnit : "month");
  const interval = configured?.interval || positiveInteger(input.interval, 1);

  return Object.freeze({
    preset: configured ? preset : "custom",
    interval,
    unit,
    weekday: input.weekday === undefined || input.weekday === null || input.weekday === ""
      ? null
      : Math.max(0, Math.min(6, Number(input.weekday))),
    day_of_month: positiveInteger(input.day_of_month, null),
  });
}

export function createServicePlanDocument(input = {}) {
  const customerPartyId = text(input.customer_party_id || input.customerPartyId);
  const customerName = text(input.customer_name || input.customerName);
  const serviceName = text(input.service_name || input.serviceName);
  const firstServiceAt = isoOrNull(input.first_service_at || input.firstServiceAt);
  const durationMinutes = positiveInteger(
    input.duration_minutes || input.durationMinutes,
    60,
  );

  const missing = [
    [customerPartyId, "customer_party_id"],
    [customerName, "customer_name"],
    [serviceName, "service_name"],
    [firstServiceAt, "first_service_at"],
  ].filter(([value]) => !value).map(([, field]) => field);

  if (missing.length > 0) {
    const error = new Error(`Service plan requires ${missing.join(", ")}.`);
    error.status = 400;
    throw error;
  }

  const contractStart = isoOrNull(input.contract_start || input.contractStart) || firstServiceAt;
  const contractEnd = isoOrNull(input.contract_end || input.contractEnd);

  if (contractEnd && new Date(contractEnd) < new Date(contractStart)) {
    const error = new Error("Service plan contract_end must be after contract_start.");
    error.status = 400;
    throw error;
  }

  return Object.freeze({
    customer_party_id: customerPartyId,
    customer_name: customerName,
    customer_location_id: text(input.customer_location_id || input.customerLocationId),
    customer_location_name: text(input.customer_location_name || input.customerLocationName),
    location_timezone: text(input.location_timezone || input.locationTimezone),
    service_name: serviceName,
    service_category: text(input.service_category || input.serviceCategory),
    industry_key: text(input.industry_key || input.industryKey) || "generic-service",
    execution_template_id: text(input.execution_template_id || input.executionTemplateId),
    recurrence: normalizeServiceRecurrence(input.recurrence || {}),
    first_service_at: firstServiceAt,
    duration_minutes: durationMinutes,
    contract_start: contractStart,
    contract_end: contractEnd,
    preferred_window: Object.freeze({
      start_time: text(input.preferred_start_time || input.preferredStartTime),
      end_time: text(input.preferred_end_time || input.preferredEndTime),
    }),
    notes: text(input.notes),
  });
}

export function servicePlanAttributes(plan) {
  return {
    service_delivery: {
      schema_version: 1,
      customer_party_id: plan.customer_party_id,
      customer_name: plan.customer_name,
      customer_location_id: plan.customer_location_id,
      customer_location_name: plan.customer_location_name,
      location_timezone: plan.location_timezone,
      service_name: plan.service_name,
      service_category: plan.service_category,
      industry_key: plan.industry_key,
      execution_template_id: plan.execution_template_id,
      recurrence: plan.recurrence,
      duration_minutes: plan.duration_minutes,
      contract_start: plan.contract_start,
      contract_end: plan.contract_end,
      preferred_window: plan.preferred_window,
      notes: plan.notes,
    },
  };
}

export default createServicePlanDocument;
