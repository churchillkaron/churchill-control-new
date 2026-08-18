import {
  resolveOperatorBusinessRead,
} from "./OperatorBusinessReadResolver";

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const REFLEX_INTENTS = Object.freeze([
  {
    topic: "revenue",
    patterns: [
      /\bsales\s+(?:today|yesterday)\b/i,
      /\brevenue\s+(?:today|yesterday)\b/i,
      /\bwhat did we (?:make|earn) yesterday\b/i,
      /\bhow much did we (?:make|earn) yesterday\b/i,
      /\bwhat have we (?:made|earned) today\b/i,
      /\bhow much have we (?:made|earned) today\b/i,
    ],
    capabilityHints: ["revenue", "sales", "turnover", "income"],
  },
  {
    topic: "cash",
    patterns: [
      /\b(?:cash|bank) balance\b/i,
      /\bhow much cash do we have\b/i,
      /\bhow much money do we have\b/i,
      /\bwhat(?:'s| is) our cash\b/i,
      /\bwhat(?:'s| is) our liquidity\b/i,
    ],
    capabilityHints: ["cash", "bank", "liquidity", "treasury", "balance"],
  },
  {
    topic: "receivables",
    patterns: [
      /\bwhat do customers owe us\b/i,
      /\bhow much do customers owe us\b/i,
      /\baccounts receivable\b/i,
      /\breceivables balance\b/i,
      /\boutstanding customer invoices\b/i,
    ],
    capabilityHints: ["receivable", "customer", "aging", "outstanding", "invoice"],
  },
  {
    topic: "payables",
    patterns: [
      /\bwhat do we owe\b/i,
      /\bhow much do we owe\b/i,
      /\baccounts payable\b/i,
      /\bpayables balance\b/i,
      /\boutstanding (?:supplier|vendor) invoices\b/i,
    ],
    capabilityHints: ["payable", "supplier", "vendor", "aging", "outstanding", "invoice"],
  },
  {
    topic: "inventory",
    patterns: [
      /\bhow much inventory do we have\b/i,
      /\bhow much stock do we have\b/i,
      /\binventory (?:on hand|balance|value|valuation)\b/i,
      /\bstock (?:on hand|balance|value|valuation)\b/i,
    ],
    capabilityHints: ["inventory", "stock", "on hand", "valuation", "warehouse"],
  },
]);

function matchedIntent(message) {
  const source = text(message);
  return REFLEX_INTENTS.find((intent) =>
    intent.patterns.some((pattern) => pattern.test(source)),
  ) || null;
}

function capabilitySearchText(capability = {}) {
  return normalized([
    capability.key,
    capability.domain,
    capability.capability,
    capability.action,
    capability.description,
    ...(Array.isArray(capability.tags) ? capability.tags : []),
  ].filter(Boolean).join(" "));
}

function capabilityMatchesIntent(capability, intent) {
  if (!capability || normalized(capability.mode) !== "read") return false;
  const haystack = capabilitySearchText(capability);
  return intent.capabilityHints.some((hint) => haystack.includes(normalized(hint)));
}

function schemaRequiredFields(capability = {}) {
  const required = capability?.input_schema?.required;
  return Array.isArray(required) ? required.map(text).filter(Boolean) : [];
}

const CONTEXT_FIELDS = new Set([
  "organizationId",
  "organization_id",
  "entityId",
  "entity_id",
  "periodId",
  "period_id",
  "partyId",
  "party_id",
  "date_from",
  "date_to",
]);

function schemaIsReflexSafe(capability) {
  return schemaRequiredFields(capability).every((field) => CONTEXT_FIELDS.has(field));
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

function temporalPayload(message, timezone) {
  const source = normalized(message);
  const today = zonedDateParts(timezone || "UTC");

  if (/\byesterday\b/.test(source)) {
    const value = isoDateShift(today, -1);
    return { date_from: value, date_to: value };
  }

  if (/\btoday\b/.test(source)) {
    const value = isoDateShift(today, 0);
    return { date_from: value, date_to: value };
  }

  return {};
}

function localClarification({ topic, entityRequired = false } = {}) {
  if (entityRequired) {
    return {
      matched: true,
      execute: false,
      topic,
      reason: "ENTITY_CONTEXT_REQUIRED",
      response_text: "Which legal entity should I use for this request?",
    };
  }

  return {
    matched: false,
    execute: false,
    topic: topic || null,
    reason: "REFLEX_NOT_SAFE",
  };
}

export function resolveOperatorBusinessDataReflex({
  message,
  capabilities = [],
  entityId = null,
  timezone = null,
} = {}) {
  const intent = matchedIntent(message);
  if (!intent) return null;

  const resolution = resolveOperatorBusinessRead({
    message,
    capabilities,
    limit: 6,
  });

  if (!resolution || resolution.topic !== intent.topic) {
    return localClarification({ topic: intent.topic });
  }

  const candidates = resolution.capabilities.filter((capability) =>
    capabilityMatchesIntent(capability, intent) && schemaIsReflexSafe(capability),
  );

  const capability = candidates[0] || null;
  if (!capability) return localClarification({ topic: intent.topic });

  if (capability.context_scope === "entity" && !text(entityId)) {
    return localClarification({ topic: intent.topic, entityRequired: true });
  }

  const payload = temporalPayload(message, timezone);

  return {
    matched: true,
    execute: true,
    topic: intent.topic,
    confidence: Math.max(0.9, Number(resolution.confidence || 0)),
    capability,
    capability_key: capability.key,
    payload,
    reason: `Deterministic ${intent.topic} business-data reflex`,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "business-data-reflex-v1",
      usage_id: null,
    },
  };
}

export default resolveOperatorBusinessDataReflex;
