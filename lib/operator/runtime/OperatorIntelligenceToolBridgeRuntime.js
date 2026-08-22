import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { listOperatorCapabilities } from "./OperatorCapabilityCatalog";
import { rankOperatorCapabilities } from "./OperatorCapabilityMatcher";

const CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_READ_TOOL_BRIDGE_V1";
const TOOL_NAME = "operator_live_read";
const DEFAULT_MAX_TOOLS = 12;
const MAX_TOOLS = 24;
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const RECURSIVE_CONTROL_CAPABILITIES = new Set([
  "platform.operator_read_chain.execute",
  "platform.operator_mission.execute",
  "platform.attention.scan",
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

function normalizePermission(value) {
  return text(value, 240).toLowerCase();
}

function permissionMatches(granted, required) {
  const actual = normalizePermission(granted);
  const needed = normalizePermission(required);
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) return needed.startsWith(actual.slice(0, -1));
  return false;
}

function hasPermissions(capability, { permissions = [], actor = {} } = {}) {
  const role = text(actor?.role || actor?.role_code || actor?.roleCode, 120).toUpperCase();
  if (FULL_ACCESS_ROLES.has(role)) return true;
  const required = list(capability?.permissions).map(normalizePermission).filter(Boolean);
  if (!required.length) return true;
  const granted = [
    ...list(permissions),
    ...list(actor?.permissions),
  ].map(normalizePermission).filter(Boolean);
  return required.every((needed) =>
    granted.some((candidate) => permissionMatches(candidate, needed)),
  );
}

function safeRead(capability, context) {
  const key = text(capability?.key, 300);
  const mode = text(capability?.mode, 80).toLowerCase();
  const risk = text(capability?.risk, 80).toLowerCase();
  const scope = text(capability?.context_scope, 80).toLowerCase();

  if (!key || RECURSIVE_CONTROL_CAPABILITIES.has(key)) return false;
  if (capability?.operator_enabled === false || mode !== "read") return false;
  if (capability?.auto_execute === false) return false;
  if (capability?.requires_confirmation === true || capability?.transactional === true) return false;
  if (["high", "critical"].includes(risk)) return false;
  if (scope === "entity" && !text(context.entityId, 160)) return false;
  return hasPermissions(capability, context);
}

function boundedMaxTools(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return DEFAULT_MAX_TOOLS;
  return Math.min(MAX_TOOLS, number);
}

function compactSchema(schema = {}) {
  const source = object(schema);
  const properties = object(source.properties);
  const fields = Object.keys(properties).slice(0, 20);
  const required = list(source.required).map((item) => text(item, 120)).filter(Boolean).slice(0, 20);
  return {
    fields,
    required,
    open: source.additionalProperties === true,
  };
}

function catalogSummary(capabilities) {
  return capabilities.map((capability) => ({
    key: capability.key,
    description: text(capability.description, 360),
    scope: capability.context_scope || "organization",
    input: compactSchema(capability.input_schema),
  }));
}

function scopedPayload({ payload, organizationId, entityId, periodId, partyId }) {
  return {
    ...object(payload),
    organizationId,
    organization_id: organizationId,
    ...(entityId ? { entityId, entity_id: entityId } : {}),
    ...(periodId ? { periodId, period_id: periodId } : {}),
    ...(partyId ? { partyId, party_id: partyId } : {}),
  };
}

export async function createOperatorIntelligenceReadTools({
  organizationId,
  entityId = null,
  periodId = null,
  partyId = null,
  actor = {},
  permissions = [],
  callerRequest = null,
  message = "",
  maxTools = DEFAULT_MAX_TOOLS,
} = {}) {
  const organization = text(organizationId, 160);
  if (!organization) {
    throw new Error("OPERATOR_INTELLIGENCE_TOOL_BRIDGE_ORGANIZATION_REQUIRED");
  }

  const context = {
    organizationId: organization,
    entityId: text(entityId, 160) || null,
    periodId: text(periodId, 160) || null,
    partyId: text(partyId, 160) || null,
    actor: object(actor),
    permissions: list(permissions),
  };
  const catalog = await listOperatorCapabilities();
  const safe = catalog.filter((capability) => safeRead(capability, context));
  const ranked = rankOperatorCapabilities({
    message: text(message, 12000),
    capabilities: safe,
    modes: ["read"],
    limit: boundedMaxTools(maxTools),
  }).map((entry) => entry.capability);

  if (!ranked.length) return [];

  const byKey = new Map(ranked.map((capability) => [capability.key, capability]));
  const keys = [...byKey.keys()];
  const summary = catalogSummary(ranked);

  return [
    {
      name: TOOL_NAME,
      description: [
        "Execute one registered Avantiqo Operator read-only capability to obtain current organization-scoped business or platform evidence.",
        "This tool cannot write, approve, publish, send, pay, deploy, mutate, or bypass governance.",
        `Available reads: ${JSON.stringify(summary)}`,
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          capability_key: {
            type: "string",
            enum: keys,
            description: "Exact registered read capability key.",
          },
          payload: {
            type: "object",
            additionalProperties: true,
            description: "Capability input only. Organization/entity/period/party scope is injected by the server and cannot be overridden.",
          },
        },
        required: ["capability_key"],
        additionalProperties: false,
      },
      mutates: false,
      approval_required: false,
      max_result_chars: 32000,
      metadata: {
        bridge_contract: CONTRACT,
        read_only: true,
      },
      async execute(args = {}) {
        const capabilityKey = text(args.capability_key, 300);
        const capability = byKey.get(capabilityKey);
        if (!capability) {
          throw new Error("OPERATOR_INTELLIGENCE_READ_CAPABILITY_NOT_EXPOSED");
        }

        const payload = scopedPayload({
          payload: args.payload,
          organizationId: organization,
          entityId: context.entityId,
          periodId: context.periodId,
          partyId: context.partyId,
        });
        const execution = await executeUbteCapability({
          organizationId: organization,
          domain: capability.domain,
          capability: capability.capability,
          action: capability.action,
          payload,
          actor: context.actor,
          runtime: {
            entityId: context.entityId,
            periodId: context.periodId,
            permissions: context.permissions,
            callerRequest,
            metadata: {
              source: "AVANTIQO_INTELLIGENCE_LIVE_READ",
              channel: "owned_intelligence_supervision",
              readOnly: true,
              intelligenceToolBridgeContract: CONTRACT,
              capabilityKey,
              partyId: context.partyId,
            },
          },
        });

        return {
          contract: CONTRACT,
          status: "completed",
          capability_key: capabilityKey,
          organization_id: organization,
          entity_id: context.entityId,
          result: execution?.result ?? execution ?? null,
        };
      },
    },
  ];
}

export const OperatorIntelligenceToolBridgeRuntime = Object.freeze({
  contract: CONTRACT,
  createReadTools: createOperatorIntelligenceReadTools,
});
