import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  acknowledgeSecretaryAbsenceHandoff,
  cancelSecretaryAbsenceCoverage,
  endSecretaryAbsenceCoverageEarly,
  listSecretaryAbsenceCoverage,
  readSecretaryAbsenceCoverage,
  refreshSecretaryAbsenceCoverage,
  reviseSecretaryAbsenceCoverage,
  startSecretaryAbsenceCoverage,
} from "@/lib/operator/secretary/SecretaryAbsenceCoverageRuntime";

const ACTIONS = Object.freeze({
  start: {
    mode: "write",
    aliases: ["set out of office coverage", "delegate temporary secretary coverage", "cover my absence"],
    description: "Create evidence-backed temporary administrative coverage for an explicit absence window, including a durable handoff, an owner calendar block, scope-bounded delegate coordination, and automatic expiry without granting platform or binding authority.",
    execute: startSecretaryAbsenceCoverage,
  },
  read: {
    mode: "read",
    aliases: ["show absence coverage", "show out of office handoff"],
    description: "Read one Secretary-managed absence coverage lifecycle, its temporary scopes, calendar block, handoff evidence, revision history, and return-to-owner state.",
    execute: readSecretaryAbsenceCoverage,
  },
  list: {
    mode: "read",
    aliases: ["list absence coverage", "who is covering whom", "show out of office coverage"],
    description: "List organization-scoped Secretary absence coverage records without inferring authority beyond explicit administrative scopes.",
    execute: listSecretaryAbsenceCoverage,
  },
  acknowledgeHandoff: {
    mode: "write",
    aliases: ["acknowledge the handoff", "delegate accepted coverage handoff"],
    description: "Record explicit evidence that the named delegate received the temporary administrative handoff. Acknowledgement never expands permissions or binding authority.",
    execute: acknowledgeSecretaryAbsenceHandoff,
  },
  revise: {
    mode: "write",
    aliases: ["change absence coverage", "update out of office delegate", "extend my absence"],
    description: "Revise an absence window, delegate, or administrative coverage scopes from explicit evidence while preserving prior coverage history and fencing stale follow-through.",
    execute: reviseSecretaryAbsenceCoverage,
  },
  refresh: {
    mode: "write",
    aliases: ["refresh absence coverage", "expire finished out of office coverage"],
    description: "Refresh temporal absence state and automatically restore the owner when the explicit coverage window has expired, without retaining temporary authority.",
    execute: refreshSecretaryAbsenceCoverage,
  },
  endEarly: {
    mode: "write",
    aliases: ["I returned early", "end out of office coverage early"],
    description: "End temporary Secretary absence coverage early from explicit evidence, restore the owner, cancel the absence block, and fence pending coverage follow-through.",
    execute: endSecretaryAbsenceCoverageEarly,
  },
  cancel: {
    mode: "write",
    aliases: ["cancel absence coverage", "cancel out of office handoff"],
    description: "Cancel Secretary-managed absence coordination while leaving unrelated appointments and any external absence state untouched.",
    execute: cancelSecretaryAbsenceCoverage,
  },
});

function locator() {
  return {
    coverage_id: { type: "string" },
    absence_key: { type: "string" },
  };
}

function schema(action) {
  if (action === "start") return {
    type: "object",
    properties: {
      absence_key: { type: "string" },
      owner_party_id: { type: "string" },
      delegate_party_id: { type: "string" },
      starts_at: { type: "string" },
      ends_at: { type: "string" },
      timezone: { type: "string" },
      all_day: { type: "boolean" },
      reason: { type: "string" },
      handoff_notes: { type: "string" },
      coverage_scopes: { type: "array", items: { type: "string" } },
      instruction_evidence_id: { type: "string" },
      source_reference: { type: "string" },
      entity_id: { type: "string" },
    },
    required: ["delegate_party_id", "starts_at", "ends_at", "coverage_scopes", "instruction_evidence_id", "source_reference"],
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: locator(),
    additionalProperties: false,
  };
  if (action === "list") return {
    type: "object",
    properties: {
      owner_party_id: { type: "string" },
      delegate_party_id: { type: "string" },
      query: { type: "string" },
      include_cancelled: { type: "boolean" },
      limit: { type: "number" },
    },
    additionalProperties: false,
  };
  if (action === "acknowledgeHandoff") return {
    type: "object",
    properties: {
      ...locator(),
      evidence_id: { type: "string" },
      source_reference: { type: "string" },
      acknowledged_at: { type: "string" },
      acknowledged_by_party_id: { type: "string" },
      notes: { type: "string" },
    },
    required: ["coverage_id", "evidence_id"],
    additionalProperties: false,
  };
  if (action === "revise") return {
    type: "object",
    properties: {
      ...locator(),
      delegate_party_id: { type: "string" },
      starts_at: { type: "string" },
      ends_at: { type: "string" },
      coverage_scopes: { type: "array", items: { type: "string" } },
      coverage_reason: { type: "string" },
      handoff_notes: { type: "string" },
      evidence_id: { type: "string" },
      source_reference: { type: "string" },
      revision_reason: { type: "string" },
    },
    required: ["coverage_id", "evidence_id", "source_reference", "revision_reason"],
    additionalProperties: false,
  };
  if (action === "refresh") return {
    type: "object",
    properties: { ...locator(), now: { type: "string" } },
    required: ["coverage_id"],
    additionalProperties: false,
  };
  if (action === "endEarly") return {
    type: "object",
    properties: {
      ...locator(),
      evidence_id: { type: "string" },
      source_reference: { type: "string" },
      reason: { type: "string" },
      ended_at: { type: "string" },
    },
    required: ["coverage_id", "evidence_id", "reason"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: { ...locator(), reason: { type: "string" } },
    required: ["coverage_id"],
    additionalProperties: false,
  };
}

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryAbsenceCoverageCapability(action = "read") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_ABSENCE_COVERAGE_ACTION_UNSUPPORTED:${text(action, 80)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_absence_coverage",
    action,
    name: `Executive Secretary absence coverage ${action}`,
    document: "secretary_absence_coverage",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_absence_coverage.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "absence", "out-of-office", "handoff", "coverage", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode !== "read",
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    approval: { required: false },
    inputSchema: schema(action),
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId, 120) && actorPartyId(context));
  }

  async function execute({ context, payload = {} }) {
    return config.execute({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryAbsenceCoverageCapability;
