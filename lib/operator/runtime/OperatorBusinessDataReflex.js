import {
  resolveOperatorBusinessRead,
} from "./OperatorBusinessReadResolver";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requiredFields(capability = {}) {
  const required = capability?.input_schema?.required;
  return Array.isArray(required) ? required.map(text).filter(Boolean) : [];
}

function contextField(field) {
  const value = normalized(field).replace(/\s+/g, "");
  return [
    "organizationid",
    "organization",
    "entityid",
    "entity",
    "periodid",
    "period",
    "partyid",
    "party",
    "datefrom",
    "dateto",
    "fromdate",
    "todate",
    "startdate",
    "enddate",
  ].includes(value);
}

function schemaIsAutomatic(capability) {
  return requiredFields(capability).every(contextField);
}

function zonedDateParts(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function isoDateShift(parts, offsetDays = 0) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function relativeDatePayload(message, timezone, capability) {
  const source = normalized(message);
  const today = zonedDateParts(timezone || "UTC");
  let date = null;

  if (/\byesterday\b/.test(source)) date = isoDateShift(today, -1);
  if (/\btoday\b/.test(source)) date = isoDateShift(today, 0);
  if (!date) return {};

  const properties = capability?.input_schema?.properties || {};
  const propertyNames = Object.keys(properties);
  const output = {};

  const aliases = [
    ["date_from", "from_date", "start_date"],
    ["date_to", "to_date", "end_date"],
  ];

  for (const group of aliases) {
    const matching = group.find((candidate) => propertyNames.includes(candidate));
    if (matching) output[matching] = date;
  }

  if (!Object.keys(output).length && capability?.input_schema?.additionalProperties === true) {
    output.date_from = date;
    output.date_to = date;
  }

  return output;
}

function entityRequired(capability, entityId) {
  return normalized(capability?.context_scope) === "entity" && !text(entityId);
}

export function resolveOperatorBusinessDataReflex({
  message,
  capabilities = [],
  entityId = null,
  timezone = null,
} = {}) {
  const resolution = resolveOperatorBusinessRead({
    message,
    capabilities,
    limit: 8,
  });

  if (!resolution?.capabilities?.length) return null;

  const candidates = list(resolution.capabilities).filter(
    (capability) =>
      normalized(capability?.mode) === "read" &&
      capability?.auto_execute !== false &&
      capability?.requires_confirmation !== true &&
      schemaIsAutomatic(capability),
  );

  const capability = candidates[0] || null;
  if (!capability) return null;

  const rankedEntry = list(resolution.ranked).find(
    (entry) => text(entry?.capability_key) === text(capability?.key),
  );
  const score = Number(rankedEntry?.score || 0);
  const separation = Number(resolution.separation || 0);

  const clearPhrase = Number(rankedEntry?.phrase_affinity || 0) >= 0.78;
  const clearCoverage =
    Number(rankedEntry?.primary_coverage || 0) >= 0.55 &&
    (separation >= 0.12 || resolution.capabilities.length === 1);

  if (!clearPhrase && !clearCoverage) return null;

  if (entityRequired(capability, entityId)) {
    return {
      matched: true,
      execute: false,
      reason: "ENTITY_CONTEXT_REQUIRED",
      response_text: "Which legal entity should I use for this request?",
    };
  }

  return {
    matched: true,
    execute: true,
    confidence: Math.max(0.9, Math.min(0.99, Number(resolution.confidence || score))),
    capability,
    capability_key: capability.key,
    payload: relativeDatePayload(message, timezone, capability),
    reason: `Registry-resolved read: ${capability.key}`,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "registry-data-reflex-v2",
      usage_id: null,
    },
  };
}

export default resolveOperatorBusinessDataReflex;
