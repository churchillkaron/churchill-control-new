import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { listOperatorCapabilities } from "./OperatorCapabilityCatalog";
import {
  rankOperatorCapabilities,
  schemaVocabulary,
} from "./OperatorCapabilityMatcher";
import {
  loadOperatorOrganizationalContext,
  operatorOrganizationalRankingText,
} from "./OperatorOrganizationalContextRuntime";

const ATTENTION_KEY = "platform.attention.scan";
const READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const ORGANIZATIONAL_CONTEXT_KEY = "platform.organizational_context.read";
const MISSION_KEY = "platform.operator_mission.execute";
const CACHE_KEY = "__AVANTIQO_OPERATOR_ATTENTION_V1__";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CANDIDATE_READS = 32;
const MAX_PLAN_STEPS = 4;
const MAX_ATTENTION_ITEMS = 5;
const MIN_PLAN_CONFIDENCE = 0.6;

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

function compactRead(capability) {
  return {
    key: text(capability?.key),
    domain: text(capability?.domain) || null,
    name: text(capability?.name) || null,
    description: text(capability?.description).slice(0, 320) || null,
    aliases: list(capability?.operator_aliases).map(text).filter(Boolean).slice(0, 6),
    examples: list(capability?.operator_examples).map(text).filter(Boolean).slice(0, 4),
    tags: list(capability?.tags).map(text).filter(Boolean).slice(0, 10),
    output_vocabulary: schemaVocabulary(capability?.output_schema).slice(0, 18),
    context_scope: text(capability?.context_scope) || null,
  };
}

function compactAction(capability) {
  return {
    key: text(capability?.key),
    domain: text(capability?.domain) || null,
    name: text(capability?.name) || null,
    description: text(capability?.description).slice(0, 280) || null,
    mode: text(capability?.mode) || null,
    risk: text(capability?.risk) || null,
    requires_confirmation: capability?.requires_confirmation === true,
    approval: capability?.approval || null,
    context_scope: text(capability?.context_scope) || null,
  };
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

function candidateReads(capabilities, context, organizationalContext) {
  const safe = list(capabilities).filter((capability) =>
    safeAttentionRead(capability, context),
  );
  if (safe.length <= MAX_CANDIDATE_READS) return safe;

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

function normalizePlan(parsed, candidates) {
  const byKey = new Map(candidates.map((item) => [text(item?.key), item]));
  const steps = [];
  const seen = new Set();

  for (const [index, requested] of list(parsed?.steps).entries()) {
    if (steps.length >= MAX_PLAN_STEPS) break;
    const key = text(requested?.capability_key);
    if (!key || seen.has(key) || !byKey.has(key)) continue;
    seen.add(key);
    const capability = byKey.get(key);
    steps.push({
      id: text(requested?.id) || `attention_${index + 1}`,
      label:
        text(requested?.label) ||
        text(capability?.name || capability?.description || key).slice(0, 120),
      capability_key: key,
      payload: {},
    });
  }

  return steps.length >= 2 ? steps : [];
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
    limit: 24,
  }).map((entry) => entry.capability);
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

async function planReads({ context, organizationalContext, candidates }) {
  const request = {
    organization_context: organizationalContext || null,
    candidate_reads: candidates.map(compactRead),
  };

  const instructions = `
You are Avantiqo's anticipatory evidence planner.
Choose the smallest useful set of live read-only capabilities that can reveal what deserves the user's attention now.

Use only candidate_reads supplied in the request. They are the live registered read capabilities available in the current organization and actor context.
Do not assume an industry, KPI set, document type, business model, threshold, benchmark, or workflow that is not represented by the supplied metadata or stored organization context.

Rules:
- Select 2 to 4 complementary reads.
- Prefer evidence that can reveal material change, unresolved state, exception, risk, commitment, blocker, or opportunity from the capabilities actually available.
- Do not choose near-duplicate reads merely to fill the plan.
- Do not choose platform infrastructure, writes, drafts, approvals, navigation, publication, messages, payments, or any side effect.
- Candidate reads require no user-supplied inputs; return empty payloads.
- Treat organization_context as orientation and historical memory, not current operational truth.
- If the available reads do not provide a credible evidence set, return use_plan=false.
- confidence means confidence that the selected live reads can support a useful attention brief.

Return exactly one JSON object and no other text:
{
  "use_plan": true,
  "confidence": 0.0,
  "reason": "short reason",
  "steps": [
    {
      "id": "attention_1",
      "label": "short evidence label",
      "capability_key": "exact supplied key"
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
      max_output_tokens: 260,
      text: { verbosity: "low" },
      response_format: { type: "json_object" },
    },
    metadata: {
      module: "OPERATOR",
      operation: "PLAN_ATTENTION",
      channel: "anticipatory",
      latency_class: "interactive",
      read_only: true,
      candidate_count: candidates.length,
    },
    category: "AI",
  });

  const parsed = parseJson(findText(execution));
  const confidence = Number(parsed?.confidence || 0);
  if (
    parsed?.use_plan !== true ||
    !Number.isFinite(confidence) ||
    confidence < MIN_PLAN_CONFIDENCE
  ) {
    return {
      steps: [],
      reason: text(parsed?.reason) || null,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      provider_evidence: providerEvidence(execution),
    };
  }

  return {
    steps: normalizePlan(parsed, candidates),
    reason: text(parsed?.reason) || null,
    confidence,
    provider_evidence: providerEvidence(execution),
  };
}

async function synthesizeAttention({
  context,
  organizationalContext,
  readResult,
  actions,
  planningEvidence,
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
- Treat live_evidence as the only source for claims about current operational state.
- organization_context may help interpret relevance and continuity, but historical memory is not proof of current state.
- Do not invent figures, thresholds, benchmarks, trends, causes, risks, deadlines, people, customers, suppliers, products, entities, or business concepts not present in the supplied evidence.
- Do not infer a dataset-wide conclusion from a representative sample when the evidence says the collection is incomplete.
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
      max_output_tokens: 620,
      text: { verbosity: "low" },
      response_format: { type: "json_object" },
    },
    metadata: {
      module: "OPERATOR",
      operation: "SYNTHESIZE_ATTENTION",
      channel: "anticipatory",
      latency_class: "interactive",
      read_only: true,
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
    planning_evidence: planningEvidence || null,
  };
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

  if (!forceRefresh) {
    const cached = readCached(context);
    if (cached) return { ...cached, cache_hit: true };
  }

  const startedAt = Date.now();
  const [organizationalContext, capabilities] = await Promise.all([
    loadOperatorOrganizationalContext({
      organizationId: context.organizationId,
      partyId,
      message: "",
      projectState: {},
    }),
    listOperatorCapabilities(),
  ]);

  const candidates = candidateReads(capabilities, context, organizationalContext);
  if (candidates.length < 2) {
    return {
      status: "insufficient_evidence",
      summary: "Not enough safe live reads are available for a proactive attention brief.",
      items: [],
      generated_at: new Date().toISOString(),
      cache_hit: false,
      latency_ms: Date.now() - startedAt,
    };
  }

  let plan;
  try {
    plan = await planReads({
      context,
      organizationalContext,
      candidates,
    });
  } catch (error) {
    console.error("OPERATOR_ATTENTION_PLAN_FAILED", {
      organizationId: context.organizationId,
      error: error?.message || error,
    });
    return {
      status: "planning_unavailable",
      summary: "A proactive attention brief could not be planned from the current evidence catalog.",
      items: [],
      generated_at: new Date().toISOString(),
      cache_hit: false,
      latency_ms: Date.now() - startedAt,
    };
  }

  if (plan.steps.length < 2) {
    const result = {
      status: "insufficient_evidence",
      summary: "The available live reads did not support a useful proactive attention brief.",
      items: [],
      generated_at: new Date().toISOString(),
      cache_hit: false,
      latency_ms: Date.now() - startedAt,
      planning: {
        confidence: plan.confidence,
        reason: plan.reason,
        provider_evidence: plan.provider_evidence,
      },
    };
    writeCached(context, result);
    return result;
  }

  const chainExecution = await executeUbteCapability({
    organizationId: context.organizationId,
    domain: "platform",
    capability: "operator_read_chain",
    action: "execute",
    payload: { steps: plan.steps },
    actor: context.actor,
    runtime: childRuntime(context),
  });
  const readResult = object(chainExecution?.result);

  const actions = actionCandidates(
    capabilities,
    context,
    readResult,
    organizationalContext,
  );

  let synthesis;
  try {
    synthesis = await synthesizeAttention({
      context,
      organizationalContext,
      readResult,
      actions,
      planningEvidence: plan.provider_evidence,
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
      planning_evidence: plan.provider_evidence,
    };
  }

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
    planning: {
      confidence: plan.confidence,
      reason: plan.reason,
      provider_evidence: plan.provider_evidence,
    },
    synthesis: {
      provider_evidence: synthesis.provider_evidence,
    },
    generated_at: new Date().toISOString(),
    cache_hit: false,
    latency_ms: Date.now() - startedAt,
  };

  writeCached(context, result);
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
