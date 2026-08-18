import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  rankOperatorCapabilities,
} from "./OperatorCapabilityMatcher";

const OPERATOR_READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const MAX_PLAN_STEPS = 4;
const MAX_CANDIDATES = 36;
const MIN_PLAN_CONFIDENCE = 0.65;

const BROAD_ANALYSIS_PATTERN = /\b(?:how\s+(?:are|is|did|have)|what\s+(?:changed|happened|needs|matters|should\s+(?:i|we)\s+know)|overview|summary|compare|comparison|trend|diagnos(?:e|is|tic)|performance|status|health|why)\b/i;
const EXPLICIT_NAVIGATION_PATTERN = /\b(?:open|navigate|go\s+to|switch\s+to)\b/i;

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

function normalizedMode(value) {
  return text(value).toLowerCase();
}

function safeRead(capability) {
  const risk = normalizedMode(capability?.risk);
  return (
    text(capability?.key) &&
    text(capability?.key) !== OPERATOR_READ_CHAIN_KEY &&
    normalizedMode(capability?.mode) === "read" &&
    capability?.operator_enabled !== false &&
    capability?.auto_execute !== false &&
    capability?.requires_confirmation !== true &&
    capability?.transactional !== true &&
    !["high", "critical"].includes(risk)
  );
}

function compactSchema(schema) {
  if (!schema || typeof schema !== "object") return null;
  const properties = object(schema.properties);
  const fields = Object.entries(properties)
    .slice(0, 24)
    .map(([name, definition]) => ({
      name,
      type: text(definition?.type) || null,
      description: text(definition?.description).slice(0, 160) || null,
    }));
  const required = list(schema.required).map(text).filter(Boolean).slice(0, 16);
  const open = schema.additionalProperties === true;
  if (!fields.length && !open) return null;
  return {
    fields,
    ...(required.length ? { required } : {}),
    ...(open ? { open: true } : {}),
  };
}

function compactCapability(capability) {
  return {
    key: text(capability?.key),
    domain: text(capability?.domain) || null,
    capability: text(capability?.capability) || null,
    action: text(capability?.action) || null,
    name: text(capability?.name) || null,
    document: text(capability?.document) || null,
    description: text(capability?.description).slice(0, 320) || null,
    aliases: list(capability?.operator_aliases).map(text).filter(Boolean).slice(0, 6),
    examples: list(capability?.operator_examples).map(text).filter(Boolean).slice(0, 4),
    tags: list(capability?.tags).map(text).filter(Boolean).slice(0, 10),
    context_scope: text(capability?.context_scope) || null,
    input: compactSchema(capability?.input_schema),
    output: compactSchema(capability?.output_schema),
  };
}

function contextText({ message, projectState, currentScreen }) {
  const state = object(projectState);
  const screen = object(currentScreen);
  return [
    text(message),
    text(state.objective),
    text(state.progress_summary),
    text(state.next_step),
    text(state.blocker),
    text(screen.name),
    text(screen.title),
    text(screen.domain),
    text(screen.workspace),
    text(screen.route),
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 3200);
}

function roundRobinReads(capabilities, limit) {
  const groups = new Map();
  for (const capability of capabilities) {
    const groupKey = text(capability?.domain) || "_";
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(capability);
  }

  const keys = [...groups.keys()].sort();
  const selected = [];
  let index = 0;
  while (selected.length < limit) {
    let added = false;
    for (const key of keys) {
      const candidate = groups.get(key)?.[index];
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

function candidateReads({ message, capabilities, projectState, currentScreen }) {
  const safe = list(capabilities).filter(safeRead);
  if (safe.length < 2) return { safe, ranked: [], candidates: [] };

  const query = contextText({ message, projectState, currentScreen });
  const ranked = rankOperatorCapabilities({
    message: query,
    capabilities: safe,
    modes: ["read"],
    limit: MAX_CANDIDATES,
  });

  const selected = [];
  const seen = new Set();
  for (const entry of ranked) {
    const capability = entry.capability;
    const key = text(capability?.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(capability);
    if (selected.length >= MAX_CANDIDATES) break;
  }

  if (selected.length < MAX_CANDIDATES) {
    for (const capability of roundRobinReads(safe, MAX_CANDIDATES)) {
      const key = text(capability?.key);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.push(capability);
      if (selected.length >= MAX_CANDIDATES) break;
    }
  }

  return { safe, ranked, candidates: selected };
}

function evidencePlannerEligible({ message, ranked, safe }) {
  const clean = text(message);
  if (!clean || safe.length < 2) return false;
  if (EXPLICIT_NAVIGATION_PATTERN.test(clean)) return false;

  const broad = BROAD_ANALYSIS_PATTERN.test(clean);
  const top = ranked[0] || null;
  const second = ranked[1] || null;
  const multiReadSignal = Boolean(
    top &&
    second &&
    Number(second.score || 0) >= 0.12 &&
    Number(second.score || 0) >= Number(top.score || 0) * 0.55,
  );

  return broad || multiReadSignal;
}

function sanitizePayload(capability, payload) {
  const source = object(payload);
  const schema = capability?.input_schema;
  if (!schema || typeof schema !== "object") return source;

  const properties = object(schema.properties);
  if (schema.additionalProperties === true) return source;

  const output = {};
  for (const [key, value] of Object.entries(source)) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
    output[key] = value;
  }
  return output;
}

function normalizePlannedSteps(parsed, candidates) {
  const byKey = new Map(
    candidates.map((capability) => [text(capability?.key), capability]),
  );
  const output = [];
  const signatures = new Set();

  for (const [index, step] of list(parsed?.steps).entries()) {
    if (output.length >= MAX_PLAN_STEPS) break;
    const capabilityKey = text(step?.capability_key);
    const capability = byKey.get(capabilityKey);
    if (!capability || !safeRead(capability)) continue;

    const payload = sanitizePayload(capability, step?.payload);
    const signature = `${capabilityKey}:${JSON.stringify(payload)}`;
    if (signatures.has(signature)) continue;
    signatures.add(signature);

    output.push({
      id: text(step?.id) || `evidence_${index + 1}`,
      label:
        text(step?.label || step?.description) ||
        text(capability?.name || capability?.description || capabilityKey).slice(0, 120),
      capability_key: capabilityKey,
      payload,
    });
  }

  return output;
}

function requiresEntity(steps, candidates, entityId) {
  if (text(entityId)) return false;
  const byKey = new Map(
    candidates.map((capability) => [text(capability?.key), capability]),
  );
  return steps.some(
    (step) =>
      normalizedMode(byKey.get(step.capability_key)?.context_scope) === "entity",
  );
}

export async function planOperatorEvidence({
  organizationId,
  partyId,
  entityId = null,
  message,
  source = "text",
  currentScreen = null,
  projectState = {},
  capabilities = [],
  temporalReference = null,
} = {}) {
  const selection = candidateReads({
    message,
    capabilities,
    projectState,
    currentScreen,
  });

  if (!evidencePlannerEligible({
    message,
    ranked: selection.ranked,
    safe: selection.safe,
  })) {
    return null;
  }

  const request = {
    user_request: text(message),
    current_context: {
      entity_id: text(entityId) || null,
      current_screen: object(currentScreen),
      project_state: object(projectState),
      temporal_reference: temporalReference || null,
    },
    candidate_reads: selection.candidates.map(compactCapability),
  };

  const instructions = `
You are Avantiqo's evidence planner. Decide whether the user's current request needs multiple independent read-only evidence sources before Avantiqo can answer intelligently.

Use only candidate_reads supplied in the request. They are live registered capabilities for this organization.
Never invent a capability, domain, record type, metric, benchmark, table, API, or business concept that is not represented by the supplied capability metadata or user context.

Planning rules:
- Return use_evidence_plan=true only when 2 to 4 reads materially improve the answer over one read or conversation alone.
- Prefer the smallest sufficient set of complementary evidence. Do not select near-duplicate reads merely to fill the plan.
- The same capability may appear more than once only when the user explicitly asks for a comparison across distinct periods or scopes.
- Select only read capabilities from candidate_reads. Never select platform.operator_read_chain.execute itself.
- Do not plan writes, approvals, drafts, navigation, publication, messages, or any side effect.
- Do not assume an industry or a fixed KPI set. Infer relevant evidence dynamically from capability descriptions, aliases, examples, tags, schemas, the user's request, current screen, and project state.
- The server supplies organization, entity, period and actor context. Do not place those identifiers in step payloads.
- For relative time phrases, use only exact date windows from current_context.temporal_reference. Do not guess today's date.
- Use named input fields from the selected capability schema. If the input contract is open and a date range is needed, use date_from and date_to.
- If one read is enough, or the request is conversational, navigational, or not evidence-dependent, return use_evidence_plan=false.
- confidence is your confidence that a multi-read plan is genuinely needed and that the selected reads answer the request.

Return exactly one JSON object and no other text:
{
  "use_evidence_plan": false,
  "confidence": 0.0,
  "reason": null,
  "steps": [
    {
      "id": "evidence_1",
      "label": "short evidence label",
      "capability_key": "exact supplied key",
      "payload": {}
    }
  ]
}
`.trim();

  try {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: organizationId,
      party_id: partyId,
      entity_id: entityId,
      service_id: "ai.text.generate",
      input: {
        input: JSON.stringify(request),
        instructions_text: instructions,
        max_output_tokens: 320,
        text: { verbosity: "low" },
        response_format: { type: "json_object" },
      },
      metadata: {
        module: "OPERATOR",
        operation: "PLAN_EVIDENCE",
        channel: text(source) || "text",
        latency_class: text(source).toLowerCase() === "voice" ? "realtime" : "interactive",
        planner: "dynamic-registry-v1",
        candidate_count: selection.candidates.length,
        read_only: true,
        multi_read_only: true,
      },
      category: "AI",
    });

    const parsed = parseJson(findText(execution));
    if (!parsed || parsed.use_evidence_plan !== true) return null;

    const confidence = Number(parsed.confidence || 0);
    if (!Number.isFinite(confidence) || confidence < MIN_PLAN_CONFIDENCE) {
      return null;
    }

    const steps = normalizePlannedSteps(parsed, selection.candidates);
    if (steps.length < 2) return null;

    if (requiresEntity(steps, selection.candidates, entityId)) {
      return {
        matched: true,
        execute: false,
        reason: "ENTITY_CONTEXT_REQUIRED",
        response_text: "Which legal entity should I use for this request?",
        provider_evidence: providerEvidence(execution),
      };
    }

    return {
      matched: true,
      execute: true,
      confidence: Math.max(MIN_PLAN_CONFIDENCE, Math.min(0.99, confidence)),
      capability_key: OPERATOR_READ_CHAIN_KEY,
      payload: { steps },
      reason:
        text(parsed.reason) ||
        `Dynamic evidence plan with ${steps.length} registered reads`,
      provider_evidence: providerEvidence(execution),
    };
  } catch (error) {
    console.error("OPERATOR_EVIDENCE_PLANNER_FALLBACK", error);
    return null;
  }
}

export default planOperatorEvidence;
