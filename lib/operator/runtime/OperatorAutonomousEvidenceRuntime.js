import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { listOperatorCapabilities } from "./OperatorCapabilityCatalog";
import { rankOperatorCapabilities } from "./OperatorCapabilityMatcher";
import {
  loadOperatorOrganizationalContext,
  operatorOrganizationalRankingText,
} from "./OperatorOrganizationalContextRuntime";

const READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const ATTENTION_KEY = "platform.attention.scan";
const ORGANIZATIONAL_CONTEXT_KEY = "platform.organizational_context.read";
const MISSION_KEY = "platform.operator_mission.execute";
const MAX_CANDIDATE_READS = 32;
const MAX_PLAN_STEPS = 4;
const MIN_PLAN_STEPS = 2;

const PLATFORM_INFRASTRUCTURE_KEYS = new Set([
  ATTENTION_KEY,
  READ_CHAIN_KEY,
  ORGANIZATIONAL_CONTEXT_KEY,
  MISSION_KEY,
]);

function text(value, limit = 1200) {
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

function grantedPermissions(context) {
  return [
    ...list(context?.permissions),
    ...list(context?.actor?.permissions),
  ]
    .map((value) => text(value, 240))
    .filter(Boolean);
}

function actorHasFullAccess(context) {
  const actor = object(context?.actor);
  return (
    actor.fullAccess === true ||
    actor.full_access === true ||
    grantedPermissions(context).includes("*")
  );
}

function hasRequiredPermissions(context, permissions = []) {
  const required = list(permissions)
    .map((value) => text(value, 240))
    .filter(Boolean);
  if (!required.length || actorHasFullAccess(context)) return true;
  const granted = grantedPermissions(context);
  return required.every((permission) =>
    granted.some((candidate) => permissionMatches(candidate, permission)),
  );
}

function requiredInputs(capability) {
  return list(capability?.input_schema?.required)
    .map((value) => text(value, 240))
    .filter(Boolean);
}

function accessibleCapability(capability, context) {
  const contextScope = text(capability?.context_scope, 80).toLowerCase();
  if (contextScope === "entity" && !text(context?.entityId, 120)) return false;
  return hasRequiredPermissions(context, capability?.permissions);
}

function safeRead(capability, context) {
  const key = text(capability?.key, 240);
  const risk = text(capability?.risk, 80).toLowerCase();
  return Boolean(
    key &&
      !PLATFORM_INFRASTRUCTURE_KEYS.has(key) &&
      capability?.operator_enabled !== false &&
      text(capability?.mode, 80).toLowerCase() === "read" &&
      capability?.auto_execute !== false &&
      capability?.requires_confirmation !== true &&
      capability?.transactional !== true &&
      !["high", "critical"].includes(risk) &&
      requiredInputs(capability).length === 0 &&
      accessibleCapability(capability, context)
  );
}

function roundRobinByDomain(capabilities, limit) {
  const groups = new Map();
  for (const capability of capabilities) {
    const domain = text(capability?.domain, 120) || "_";
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(capability);
  }

  const domains = [...groups.keys()].sort();
  const selected = [];
  let index = 0;
  while (selected.length < limit) {
    let added = false;
    for (const domain of domains) {
      const candidate = groups.get(domain)?.[index];
      if (!candidate) continue;
      selected.push(candidate);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
    index += 1;
  }
  return selected;
}

function orderedCandidateReads(capabilities, context, organizationalContext) {
  const safe = list(capabilities).filter((capability) => safeRead(capability, context));
  const rankingText = operatorOrganizationalRankingText(organizationalContext);
  const ranked = rankingText
    ? rankOperatorCapabilities({
        message: rankingText,
        capabilities: safe,
        modes: ["read"],
        limit: Math.min(16, MAX_CANDIDATE_READS),
      }).map((entry) => entry.capability)
    : [];

  const output = [];
  const seen = new Set();
  for (const capability of [
    ...ranked,
    ...roundRobinByDomain(safe, MAX_CANDIDATE_READS),
  ]) {
    const key = text(capability?.key, 240);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(capability);
    if (output.length >= MAX_CANDIDATE_READS) break;
  }
  return output;
}

function deterministicPlan(candidates) {
  const selected = [];
  const selectedKeys = new Set();
  const selectedDomains = new Set();

  for (const capability of candidates) {
    if (selected.length >= MAX_PLAN_STEPS) break;
    const key = text(capability?.key, 240);
    const domain = text(capability?.domain, 120) || "_";
    if (!key || selectedKeys.has(key) || selectedDomains.has(domain)) continue;
    selected.push(capability);
    selectedKeys.add(key);
    selectedDomains.add(domain);
  }

  if (selected.length < MIN_PLAN_STEPS) {
    for (const capability of candidates) {
      if (selected.length >= MAX_PLAN_STEPS) break;
      const key = text(capability?.key, 240);
      if (!key || selectedKeys.has(key)) continue;
      selected.push(capability);
      selectedKeys.add(key);
    }
  }

  const steps = selected.map((capability, index) => ({
    id: `attention_${index + 1}`,
    label:
      text(
        capability?.name || capability?.description || capability?.key,
        120,
      ) || `Evidence ${index + 1}`,
    capability_key: text(capability?.key, 240),
    payload: {},
  }));

  return {
    strategy: "autonomous_manifest_ranked_domain_diverse_v1",
    candidate_count: candidates.length,
    selected_count: steps.length,
    selected_capability_keys: steps.map((step) => step.capability_key),
    steps: steps.length >= MIN_PLAN_STEPS ? steps : [],
  };
}

function childRuntime(context) {
  return {
    entityId: context.entityId,
    periodId: context.periodId,
    country: context.country,
    workspace: context.workspace,
    permissions: context.permissions,
    installedModules: context.installedModules,
    featureFlags: context.featureFlags,
    locale: context.locale,
    currency: context.currency,
    timezone: context.timezone,
    correlationId: context.correlationId,
    callerRequest: context.callerRequest,
    metadata: {
      ...object(context.metadata),
      source: "AVANTIQO_SYNTHETIC_INTELLIGENCE_WATCH",
      channel: "autonomous_evidence",
      parentCapabilityKey: ATTENTION_KEY,
      attentionPlanner: "autonomous_manifest_ranked_domain_diverse_v1",
      readOnly: true,
    },
  };
}

export async function scanOperatorAutonomousEvidence({ context } = {}) {
  const organizationId = text(context?.organizationId, 120);
  const partyId = text(context?.metadata?.partyId, 120);
  if (!organizationId) throw new Error("OPERATOR_AUTONOMOUS_EVIDENCE_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("OPERATOR_AUTONOMOUS_EVIDENCE_PARTY_REQUIRED");

  const startedAt = Date.now();
  const [organizationalContext, capabilities] = await Promise.all([
    loadOperatorOrganizationalContext({
      organizationId,
      partyId,
      message: "",
      projectState: {},
    }),
    listOperatorCapabilities(),
  ]);
  const candidates = orderedCandidateReads(
    capabilities,
    context,
    organizationalContext,
  );
  const plan = deterministicPlan(candidates);

  if (plan.steps.length < MIN_PLAN_STEPS) {
    return {
      status: "insufficient_evidence",
      summary: "Not enough safe live reads are available for autonomous evidence review.",
      items: [],
      evidence: {
        status: "insufficient_evidence",
        total_steps: 0,
        completed_steps: 0,
        failed_steps: 0,
        steps: [],
      },
      planning: plan,
      generated_at: new Date().toISOString(),
      synthesis: {
        mode: "deterministic_evidence_only",
        provider_evidence: null,
      },
      latency_ms: Date.now() - startedAt,
    };
  }

  let readResult;
  try {
    const chainExecution = await executeUbteCapability({
      organizationId,
      domain: "platform",
      capability: "operator_read_chain",
      action: "execute",
      payload: { steps: plan.steps },
      actor: context.actor,
      runtime: childRuntime(context),
    });
    readResult = object(chainExecution?.result);
  } catch (error) {
    console.error("OPERATOR_AUTONOMOUS_EVIDENCE_READ_FAILED", {
      organizationId,
      error: error?.message || error,
    });
    return {
      status: "read_unavailable",
      summary: "The autonomous evidence scan could not complete its registered reads.",
      items: [],
      evidence: {
        status: "read_unavailable",
        total_steps: 0,
        completed_steps: 0,
        failed_steps: 0,
        steps: [],
      },
      planning: plan,
      generated_at: new Date().toISOString(),
      synthesis: {
        mode: "deterministic_evidence_only",
        provider_evidence: null,
      },
      latency_ms: Date.now() - startedAt,
    };
  }

  const completedSteps = list(readResult?.steps).filter(
    (step) => text(step?.status, 80).toLowerCase() === "completed",
  );
  return {
    status: completedSteps.length ? "evidence_ready" : "clear",
    summary: completedSteps.length
      ? "Live evidence was collected for autonomous business-thesis evaluation."
      : "No completed live evidence was available for autonomous business-thesis evaluation.",
    items: [],
    evidence: {
      status: text(readResult?.status, 80) || null,
      total_steps: Number(readResult?.total_steps || 0),
      completed_steps: Number(readResult?.completed_steps || 0),
      failed_steps: Number(readResult?.failed_steps || 0),
      steps: list(readResult?.steps),
    },
    planning: plan,
    generated_at: new Date().toISOString(),
    synthesis: {
      mode: "deterministic_evidence_only",
      provider_evidence: null,
    },
    latency_ms: Date.now() - startedAt,
  };
}

export default scanOperatorAutonomousEvidence;
