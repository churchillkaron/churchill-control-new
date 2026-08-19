import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { listOperatorCapabilities } from "./OperatorCapabilityCatalog";
import { rankOperatorCapabilities } from "./OperatorCapabilityMatcher";
import {
  loadOperatorOrganizationalContext,
  operatorOrganizationalRankingText,
} from "./OperatorOrganizationalContextRuntime";

const ATTENTION_KEY = "platform.attention.scan";
const READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const ORGANIZATIONAL_CONTEXT_KEY = "platform.organizational_context.read";
const MISSION_KEY = "platform.operator_mission.execute";
const CACHE_KEY = "__AVANTIQO_OPERATOR_ATTENTION_V2__";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CANDIDATE_READS = 32;
const MAX_PLAN_STEPS = 4;
const MIN_PLAN_STEPS = 2;
const MAX_ATTENTION_ITEMS = 5;
const MAX_ACTION_CANDIDATES = 16;

const PLATFORM_INFRASTRUCTURE_KEYS = new Set([
  ATTENTION_KEY,
  READ_CHAIN_KEY,
  ORGANIZATIONAL_CONTEXT_KEY,
  MISSION_KEY,
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;

  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue to the next conservative extraction.
    }
  }

  return null;
}

function findText(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findText(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";

  for (const key of ["text", "output_text", "content", "message"]) {
    const direct = value[key];
    if (typeof direct === "string" && direct.trim()) return direct;
  }

  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }

  return "";
}

function providerEvidence(execution) {
  return {
    provider: execution?.provider || null,
    model: execution?.model || null,
    usage_id: execution?.usage?.id || null,
    pricing_id: execution?.pricing?.pricing_id || null,
  };
}

function permissionMatches(granted, required) {
  const actual = text(granted).toLowerCase();
  const needed = text(required).toLowerCase();
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
    .map(text)
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
  const required = list(permissions).map(text).filter(Boolean);
  if (!required.length || actorHasFullAccess(context)) return true;
  const granted = grantedPermissions(context);
  return required.every((permission) =>
    granted.some((candidate) => permissionMatches(candidate, permission)),
  );
}

function requiredInputs(capability) {
  return list(capability?.input_schema?.required).map(text).filter(Boolean);
}

function accessibleCapability(capability, context) {
  const contextScope = text(capability?.context_scope).toLowerCase();
  if (contextScope === "entity" && !text(context?.entityId)) return false;
  return hasRequiredPermissions(context, capability?.permissions);
}

function safeAttentionRead(capability, context) {
  const key = text(capability?.key);
  const risk = text(capability?.risk).toLowerCase();
  return (
    key &&
    !PLATFORM_INFRASTRUCTURE_KEYS.has(key) &&
    capability?.operator_enabled !== false &&
    text(capability?.mode).toLowerCase() === "read" &&
    capability?.auto_execute !== false &&
    capability?.requires_confirmation !== true &&
    capability?.transactional !== true &&
    !["high", "critical"].includes(risk) &&
    requiredInputs(capability).length === 0 &&
    accessibleCapability(capability, context)
  );
}

function recommendableAction(capability, context) {
  const key = text(capability?.key);
  const mode = text(capability?.mode).toLowerCase();
  return (
    key &&
    !PLATFORM_INFRASTRUCTURE_KEYS.has(key) &&
    ["draft", "write", "approve"].includes(mode) &&
    capability?.operator_enabled !== false &&
    accessibleCapability(capability, context)
  );
}

function roundRobinByDomain(capabilities, limit) {
  const groups = new Map();
  for (const capability of capabilities) {
    const domain = text(capability?.domain) || "_";
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
  const safe = list(capabilities).filter((capability) =>
    safeAttentionRead(capability, context),
  );

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
    const key = text(capability?.key);
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
    const key = text(capability?.key);
    const domain = text(capability?.domain) || "_";
    if (!key || selectedKeys.has(key) || selectedDomains.has(domain)) continue;
    selected.push(capability);
    selectedKeys.add(key);
    selectedDomains.add(domain);
  }

  if (selected.length < MIN_PLAN_STEPS) {
    for (const capability of candidates) {
      if (selected.length >= MAX_PLAN_STEPS) break;
      const key = text(capability?.key);
      if (!key || selectedKeys.has(key)) continue;
      selected.push(capability);
      selectedKeys.add(key);
    }
  }

  const steps = selected.map((capability, index) => ({
    id: `attention_${index + 1}`,
    label:
      text(capability?.name || capability?.description || capability?.key).slice(0, 120) ||
      `Evidence ${index + 1}`,
    capability_key: text(capability?.key),
    payload: {},
  }));

  return {
    strategy: "manifest_ranked_domain_diverse_v2",
    candidate_count: candidates.length,
    selected_count: steps.length,
    selected_capability_keys: steps.map((step) => step.capability_key),
    steps: steps.length >= MIN_PLAN_STEPS ? steps : [],
  };
}

function cacheState() {
  if (!globalThis[CACHE_KEY]) globalThis[CACHE_KEY] = new Map();
  return globalThis[CACHE_KEY];
}

function cacheId(context) {
  return [
    text(context?.organizationId),
    text(context?.metadata?.partyId),
    text(context?.entityId) || "-",
    text(context?.periodId) || "-",
  ].join(":");
}

function readCached(context) {
  const entry = cacheState().get(cacheId(context));
  if (!entry) return null;
  if (Date.now() - entry.created_at_ms >= CACHE_TTL_MS) {
    cacheState().delete(cacheId(context));
    return null;
  }
  return entry.value;
}

function writeCached(context, value) {
  cacheState().set(cacheId(context), {
    created_at_ms: Date.now(),
    value,
  });
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
      source: "AVANTIQO_OPERATOR",
      channel: "attention",
      parentCapabilityKey: ATTENTION_KEY,
      attentionPlanner: "manifest_ranked_domain_diverse_v2",
    },
  };
}

function evidenceText(readResult, organizationalContext) {
  return [
    operatorOrganizationalRankingText(organizationalContext),
    JSON.stringify(readResult || {}),
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 12000);
}

function actionCandidates(capabilities, context, readResult, organizationalContext) {
  const actions = list(capabilities).filter((capability) =>
    recommendableAction(capability, context),
  );
  if (!actions.length) return [];

  return rankOperatorCapabilities({
    message: evidenceText(readResult, organizationalContext),
    capabilities: actions,
    modes: ["draft", "write", "approve"],
    limit: MAX_ACTION_CANDIDATES,
  }).map((entry) => entry.capability);
}

function compactAction(capability) {
  return {
    key: text(capability?.key),
    domain: text(capability?.domain) || null,
    name: text(capability?.name) || null,
    description: text(capability?.description).slice(0, 260) || null,
    mode: text(capability?.mode) || null,
    risk: text(capability?.risk) || null,
    requires_confirmation: capability?.requires_confirmation === true,
    approval: capability?.approval || null,
    context_scope: text(capability?.context_scope) || null,
  };
}

function normalizeAttentionItems(parsed, readSteps, actions) {
  const validEvidence = new Set(readSteps.map((step) => text(step?.id)).filter(Boolean));
  const actionsByKey = new Map(actions.map((action) => [text(action?.key), action]));
  const items = [];

  for (const candidate of list(parsed?.items)) {
    if (items.length >= MAX_ATTENTION_ITEMS) break;
    const title = text(candidate?.title).slice(0, 160);
    const whyNow = text(candidate?.why_now || candidate?.reason).slice(0, 600);
    if (!title || !whyNow) continue;

    const evidenceRefs = unique(list(candidate?.evidence_refs))
      .filter((value) => validEvidence.has(value))
      .slice(0, 4);
    if (!evidenceRefs.length) continue;

    const requestedActionKey = text(candidate?.recommended_capability_key);
    const action = actionsByKey.get(requestedActionKey) || null;

    items.push({
      rank: items.length + 1,
      title,
      why_now: whyNow,
      evidence_refs: evidenceRefs,
      recommended_next_step:
        text(candidate?.recommended_next_step).slice(0, 500) || null,
      recommended_action: action
        ? {
            capability_key: action.key,
            description: text(action.description) || null,
            mode: text(action.mode) || null,
            risk: text(action.risk) || null,
            requires_confirmation: action.requires_confirmation === true,
            approval: action.approval || null,
          }
        : null,
    });
  }

  return items;
}

async function synthesizeAttention({
  context,
  organizationalContext,
  readResult,
  actions,
}) {
  const readSteps = list(readResult?.steps);
  const completedSteps = readSteps.filter((step) => text(step?.status) === "completed");
  if (!completedSteps.length) {
    return {
      summary: "No live evidence was available for an attention brief.",
      items: [],
      provider_evidence: null,
    };
  }

  const request = {
    organization_context: organizationalContext || null,
    live_evidence: readResult,
    available_actions: actions.map(compactAction),
  };

  const instructions = `
You are Avantiqo's anticipatory executive analyst.
Create a concise attention brief from the supplied live evidence.

Rules:
- Treat live_evidence as the only source for claims about current state.
- organization_context may help interpret relevance and continuity, but historical memory is not proof of current state.
- Do not invent facts, values, thresholds, benchmarks, trends, causes, deadlines, identities, objects, relationships, or domain concepts not present in the supplied evidence.
- Do not infer a collection-wide conclusion from a representative sample when the evidence says the collection is incomplete.
- Return only items that have direct evidence references to completed read steps.
- Rank the most material evidence-backed items first. Fewer strong items are better than filler.
- A recommended action is optional. If you recommend one, use only an exact key from available_actions and explain the next step naturally. Recommendation never authorizes execution.
- Do not execute, stage, confirm, approve, publish, message, pay, mutate, or otherwise cause a side effect.
- If the evidence is healthy, neutral, insufficient, or not materially actionable, say so and return fewer or zero items.

Return exactly one JSON object and no other text:
{
  "summary": "short executive summary",
  "items": [
    {
      "title": "short attention item",
      "why_now": "evidence-grounded reason",
      "evidence_refs": ["attention_1"],
      "recommended_next_step": "optional next step",
      "recommended_capability_key": null
    }
  ]
}
`.trim();

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: context.organizationId,
    party_id: text(context?.metadata?.partyId) || null,
    entity_id: context.entityId || null,
    service_id: "ai.text.generate",
    input: {
      input: JSON.stringify(request),
      instructions_text: instructions,
      max_output_tokens: 520,
      text: { verbosity: "low" },
      response_format: { type: "json_object" },
    },
    metadata: {
      module: "OPERATOR",
      operation: "SYNTHESIZE_ATTENTION",
      channel: "anticipatory",
      latency_class: "interactive",
      read_only: true,
      planner: "manifest_ranked_domain_diverse_v2",
      evidence_step_count: completedSteps.length,
      action_candidate_count: actions.length,
    },
    category: "AI",
  });

  const parsed = parseJson(findText(execution));
  return {
    summary:
      text(parsed?.summary).slice(0, 800) ||
      "No evidence-backed attention items were identified from the selected reads.",
    items: normalizeAttentionItems(parsed, completedSteps, actions),
    provider_evidence: providerEvidence(execution),
  };
}

function logLatency(context, latency, status, cacheHit) {
  console.info(
    "OPERATOR_ATTENTION_LATENCY_V2",
    JSON.stringify({
      ...latency,
      organization_id: context.organizationId,
      entity_scoped: Boolean(context.entityId),
      cache_hit: cacheHit === true,
      status: text(status) || null,
      planner: "manifest_ranked_domain_diverse_v2",
    }),
  );
}

export async function scanOperatorAttention({
  context,
  forceRefresh = false,
} = {}) {
  if (!text(context?.organizationId)) {
    throw new Error("OPERATOR_ATTENTION_ORGANIZATION_REQUIRED");
  }
  const partyId = text(context?.metadata?.partyId);
  if (!partyId) {
    throw new Error("OPERATOR_ATTENTION_PARTY_REQUIRED");
  }

  const startedAt = Date.now();

  if (!forceRefresh) {
    const cached = readCached(context);
    if (cached) {
      const latency = {
        setup_ms: 0,
        read_chain_ms: 0,
        synthesis_ms: 0,
        total_ms: Date.now() - startedAt,
      };
      logLatency(context, latency, cached.status, true);
      return {
        ...cached,
        cache_hit: true,
        latency,
        latency_ms: latency.total_ms,
      };
    }
  }

  const setupStartedAt = Date.now();
  const [organizationalContext, capabilities] = await Promise.all([
    loadOperatorOrganizationalContext({
      organizationId: context.organizationId,
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
  const setupMs = Date.now() - setupStartedAt;

  if (plan.steps.length < MIN_PLAN_STEPS) {
    const latency = {
      setup_ms: setupMs,
      read_chain_ms: 0,
      synthesis_ms: 0,
      total_ms: Date.now() - startedAt,
    };
    const result = {
      status: "insufficient_evidence",
      summary: "Not enough safe live reads are available for a proactive attention brief.",
      items: [],
      planning: plan,
      generated_at: new Date().toISOString(),
      cache_hit: false,
      latency,
      latency_ms: latency.total_ms,
    };
    writeCached(context, result);
    logLatency(context, latency, result.status, false);
    return result;
  }

  const readStartedAt = Date.now();
  let readResult;
  try {
    const chainExecution = await executeUbteCapability({
      organizationId: context.organizationId,
      domain: "platform",
      capability: "operator_read_chain",
      action: "execute",
      payload: { steps: plan.steps },
      actor: context.actor,
      runtime: childRuntime(context),
    });
    readResult = object(chainExecution?.result);
  } catch (error) {
    const readChainMs = Date.now() - readStartedAt;
    const latency = {
      setup_ms: setupMs,
      read_chain_ms: readChainMs,
      synthesis_ms: 0,
      total_ms: Date.now() - startedAt,
    };
    console.error("OPERATOR_ATTENTION_READ_CHAIN_FAILED", {
      organizationId: context.organizationId,
      error: error?.message || error,
    });
    const result = {
      status: "read_unavailable",
      summary: "The proactive evidence scan could not complete its registered reads.",
      items: [],
      planning: plan,
      generated_at: new Date().toISOString(),
      cache_hit: false,
      latency,
      latency_ms: latency.total_ms,
    };
    logLatency(context, latency, result.status, false);
    return result;
  }
  const readChainMs = Date.now() - readStartedAt;

  const actions = actionCandidates(
    capabilities,
    context,
    readResult,
    organizationalContext,
  );

  const synthesisStartedAt = Date.now();
  let synthesis;
  try {
    synthesis = await synthesizeAttention({
      context,
      organizationalContext,
      readResult,
      actions,
    });
  } catch (error) {
    console.error("OPERATOR_ATTENTION_SYNTHESIS_FAILED", {
      organizationId: context.organizationId,
      error: error?.message || error,
    });
    synthesis = {
      summary: "Live evidence was collected, but the proactive attention summary could not be generated.",
      items: [],
      provider_evidence: null,
    };
  }
  const synthesisMs = Date.now() - synthesisStartedAt;

  const latency = {
    setup_ms: setupMs,
    read_chain_ms: readChainMs,
    synthesis_ms: synthesisMs,
    total_ms: Date.now() - startedAt,
  };

  const result = {
    status: synthesis.items.length ? "attention" : "clear",
    summary: synthesis.summary,
    items: synthesis.items,
    evidence: {
      status: text(readResult.status) || null,
      total_steps: Number(readResult.total_steps || 0),
      completed_steps: Number(readResult.completed_steps || 0),
      failed_steps: Number(readResult.failed_steps || 0),
      steps: list(readResult.steps),
    },
    planning: plan,
    synthesis: {
      provider_evidence: synthesis.provider_evidence,
    },
    generated_at: new Date().toISOString(),
    cache_hit: false,
    latency,
    latency_ms: latency.total_ms,
  };

  writeCached(context, result);
  logLatency(context, latency, result.status, false);
  return result;
}

export function clearOperatorAttentionCache({
  organizationId = null,
  partyId = null,
} = {}) {
  const cache = cacheState();
  if (!text(organizationId) && !text(partyId)) {
    cache.clear();
    return;
  }

  for (const key of [...cache.keys()]) {
    const [cachedOrganizationId, cachedPartyId] = key.split(":");
    if (
      (!text(organizationId) || cachedOrganizationId === text(organizationId)) &&
      (!text(partyId) || cachedPartyId === text(partyId))
    ) {
      cache.delete(key);
    }
  }
}

export default scanOperatorAttention;
