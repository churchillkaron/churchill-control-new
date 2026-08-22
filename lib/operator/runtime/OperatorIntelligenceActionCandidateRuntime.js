import { listOperatorCapabilities } from "./OperatorCapabilityCatalog";
import { rankOperatorCapabilities } from "./OperatorCapabilityMatcher";

const CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_ACTION_CANDIDATE_V1";
const TOOL_NAME = "operator_action_candidate";
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const INTERNAL_KEYS = new Set([
  "platform.operator_read_chain.execute",
  "platform.operator_mission.execute",
  "platform.organizational_context.read",
  "platform.attention.scan",
]);
const CONTEXT_FIELDS = new Set([
  "organizationid",
  "organization_id",
  "entityid",
  "entity_id",
  "periodid",
  "period_id",
  "partyid",
  "party_id",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function permissionMatches(granted, required) {
  const actual = text(granted, 240).toLowerCase();
  const needed = text(required, 240).toLowerCase();
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) return needed.startsWith(actual.slice(0, -1));
  return false;
}

function hasPermissions(capability, { permissions = [], actor = {} } = {}) {
  const role = text(actor?.role || actor?.role_code || actor?.roleCode, 120).toUpperCase();
  if (FULL_ACCESS_ROLES.has(role)) return true;
  const required = list(capability?.permissions).map((item) => text(item, 240)).filter(Boolean);
  if (!required.length) return false;
  const granted = [...list(permissions), ...list(actor?.permissions)]
    .map((item) => text(item, 240))
    .filter(Boolean);
  return required.every((needed) => granted.some((candidate) => permissionMatches(candidate, needed)));
}

function eligibleAction(capability, context) {
  const key = text(capability?.key, 300);
  const mode = text(capability?.mode, 80).toLowerCase();
  const scope = text(capability?.context_scope, 80).toLowerCase();
  if (!key || INTERNAL_KEYS.has(key)) return false;
  if (capability?.operator_enabled === false) return false;
  if (!["draft", "write", "approve"].includes(mode)) return false;
  if (scope === "entity" && !text(context.entityId, 160)) return false;
  return hasPermissions(capability, context);
}

function missingRequiredFields(capability, payload = {}, context = {}) {
  const schema = object(capability?.input_schema);
  const required = list(schema.required).map((item) => text(item, 120)).filter(Boolean);
  const values = object(payload);
  return required.filter((field) => {
    if (Object.prototype.hasOwnProperty.call(values, field)) return false;
    const normalized = field.toLowerCase();
    if (!CONTEXT_FIELDS.has(normalized)) return true;
    if (normalized.includes("organization")) return !text(context.organizationId, 160);
    if (normalized.includes("entity")) return !text(context.entityId, 160);
    if (normalized.includes("period")) return !text(context.periodId, 160);
    if (normalized.includes("party")) return !text(context.partyId, 160);
    return true;
  });
}

function summary(capability) {
  return {
    key: capability.key,
    description: text(capability.description, 360),
    mode: capability.mode,
    risk: capability.risk,
    context_scope: capability.context_scope || "organization",
    requires_confirmation: capability.requires_confirmation === true || capability.auto_execute === false,
    transactional: capability.transactional === true,
    reversible: capability.reversible === true,
    approval: capability.approval || null,
    required_fields: list(capability?.input_schema?.required).slice(0, 20),
  };
}

export async function createOperatorIntelligenceActionCandidateTools({
  organizationId,
  entityId = null,
  periodId = null,
  partyId = null,
  actor = {},
  permissions = [],
  message = "",
  maxActions = 10,
} = {}) {
  const organization = text(organizationId, 160);
  if (!organization) throw new Error("OPERATOR_INTELLIGENCE_ACTION_CANDIDATE_ORGANIZATION_REQUIRED");

  const context = {
    organizationId: organization,
    entityId: text(entityId, 160) || null,
    periodId: text(periodId, 160) || null,
    partyId: text(partyId, 160) || null,
    actor: object(actor),
    permissions: list(permissions),
  };
  const catalog = await listOperatorCapabilities();
  const eligible = catalog.filter((capability) => eligibleAction(capability, context));
  const ranked = rankOperatorCapabilities({
    message: text(message, 12000),
    capabilities: eligible,
    modes: ["draft", "write", "approve"],
    limit: Math.max(1, Math.min(20, Number(maxActions) || 10)),
  }).map((entry) => entry.capability);
  if (!ranked.length) return [];

  const byKey = new Map(ranked.map((capability) => [capability.key, capability]));
  return [{
    name: TOOL_NAME,
    description: [
      "Validate one exact registered Avantiqo business action as a planning candidate.",
      "This tool never executes, persists, confirms, approves, publishes, sends, pays, deploys, or mutates anything.",
      "Use it only to ground an action recommendation in the real capability catalog.",
      `Available actions: ${JSON.stringify(ranked.map(summary))}`,
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        capability_key: { type: "string", enum: [...byKey.keys()] },
        payload: { type: "object", additionalProperties: true },
        reason: { type: "string" },
      },
      required: ["capability_key"],
      additionalProperties: false,
    },
    mutates: false,
    approval_required: false,
    async execute(args = {}) {
      const key = text(args.capability_key, 300);
      const capability = byKey.get(key);
      if (!capability) throw new Error("OPERATOR_INTELLIGENCE_ACTION_CANDIDATE_NOT_EXPOSED");
      const missing = missingRequiredFields(capability, args.payload, context);
      return {
        contract: CONTRACT,
        candidate_only: true,
        executed: false,
        persisted: false,
        capability: summary(capability),
        payload: object(args.payload),
        reason: text(args.reason, 800) || null,
        payload_complete: missing.length === 0,
        missing_required_fields: missing,
        normal_operator_governance_required: true,
      };
    },
  }];
}

export const OperatorIntelligenceActionCandidateRuntime = Object.freeze({
  contract: CONTRACT,
  createTools: createOperatorIntelligenceActionCandidateTools,
});
