import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
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

function normalizeIntent(value) {
  const intent = text(value).toLowerCase();
  if (["answer", "clarify", "navigate", "execute", "plan"].includes(intent)) {
    return intent;
  }
  return "answer";
}

function boundedConversation(messages = [], source = "text") {
  const voice = text(source).toLowerCase() === "voice";
  return list(messages)
    .slice(voice ? -6 : -12)
    .map((message) => ({
      role: text(message?.role) === "assistant" ? "assistant" : "user",
      content: text(message?.content).slice(0, voice ? 1800 : 6000),
    }))
    .filter((message) => message.content);
}

function tokens(value) {
  const stop = new Set([
    "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "at",
    "is", "are", "was", "were", "be", "been", "with", "from", "by", "my",
    "our", "me", "i", "we", "you", "please", "can", "could", "would",
    "what", "how", "tell", "show", "get", "give", "open", "today", "now",
  ]);

  return Array.from(
    new Set(
      text(value)
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, " ")
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 1 && !stop.has(item)),
    ),
  ).slice(0, 18);
}

function relevanceScore(item, queryTokens) {
  if (!queryTokens.length) return 0;

  const primary = [
    item?.key,
    item?.name,
    item?.domain,
    item?.capability,
    item?.action,
    item?.workspace_id,
    item?.item_id,
  ]
    .map(text)
    .join(" ")
    .toLowerCase();

  const secondary = [
    item?.description,
    item?.search_text,
    item?.group_name,
    item?.document,
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ]
    .map(text)
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    if (primary.includes(token)) score += 6;
    if (secondary.includes(token)) score += 2;
  }
  return score;
}

function ranked(items, message, limit) {
  const source = list(items);
  if (source.length <= limit) return source;

  const queryTokens = tokens(message);
  if (!queryTokens.length) return source.slice(0, limit);

  return source
    .map((item, index) => ({
      item,
      index,
      score: relevanceScore(item, queryTokens),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function boundedTargets(targets = [], message = "", source = "text") {
  const voice = text(source).toLowerCase() === "voice";
  const selected = ranked(targets, message, voice ? 36 : 120);

  return selected.map((target) => ({
    id: target.id,
    kind: target.kind,
    domain_id: target.domain_id,
    workspace_id: target.workspace_id,
    item_id: target.item_id,
    name: target.name,
    description: target.description,
    route: target.route,
    group_name: target.group_name,
    document: target.document,
  }));
}

function boundedCapabilities(capabilities = [], message = "", source = "text") {
  const voice = text(source).toLowerCase() === "voice";
  const selected = ranked(capabilities, message, voice ? 48 : 140);

  return selected.map((capability) => ({
    key: capability.key,
    domain: capability.domain,
    capability: capability.capability,
    action: capability.action,
    description: capability.description,
    permissions: capability.permissions,
    tags: capability.tags,
    input_schema: capability.input_schema,
    mode: capability.mode,
    risk: capability.risk,
    approval: capability.approval,
    reversible: capability.reversible,
    transactional: capability.transactional,
  }));
}

function normalizeDecision(value = {}) {
  const decision = object(value);
  const clarification = object(decision.clarification);
  const execution = object(decision.execution);
  const navigation = object(decision.navigation);

  return {
    response_text:
      text(decision.response_text || decision.response || decision.message) ||
      "I need a little more information before I can continue.",
    response_language:
      text(decision.response_language || decision.language) || null,
    intent: normalizeIntent(decision.intent),
    confidence: Math.max(
      0,
      Math.min(1, Number(decision.confidence ?? 0.5) || 0.5),
    ),
    agreement_state: object(decision.agreement_state),
    clarification: {
      required: clarification.required === true,
      question: text(clarification.question) || null,
      options: list(clarification.options)
        .slice(0, 6)
        .map((option) =>
          typeof option === "string"
            ? { id: option, label: option }
            : {
                id: text(option?.id || option?.label),
                label: text(option?.label || option?.id),
                description: text(option?.description) || null,
              },
        )
        .filter((option) => option.id && option.label),
    },
    navigation: {
      target_id: text(navigation.target_id || decision.navigation_target_id) || null,
    },
    execution: {
      capability_key:
        text(execution.capability_key || decision.capability_key) || null,
      payload: object(execution.payload),
      reason: text(execution.reason) || null,
    },
    plan: list(decision.plan)
      .slice(0, 8)
      .map((step, index) => ({
        id: text(step?.id) || `step_${index + 1}`,
        description: text(step?.description || step?.label || step),
        capability_key: text(step?.capability_key) || null,
        status: text(step?.status) || "proposed",
      }))
      .filter((step) => step.description),
  };
}

export async function reasonAboutOperatorTurn({
  organizationId,
  partyId,
  entityId = null,
  locale = null,
  timezone = null,
  message,
  source = "text",
  currentScreen = null,
  agreementState = {},
  conversation = [],
  navigationTargets = [],
  capabilities = [],
} = {}) {
  if (!organizationId) throw new Error("OPERATOR_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("OPERATOR_PARTY_REQUIRED");
  if (!text(message)) throw new Error("OPERATOR_MESSAGE_REQUIRED");

  const voice = text(source).toLowerCase() === "voice";
  const instructions = `
You are Avantiqo Operator, the conversational operating interface for a business operating system.

Understand the user's request, answer naturally, and when sufficiently clear select a real supplied navigation target or capability.

Rules:
- Reply in the user's current language unless they explicitly request another language.
- Preserve business names, product names, people names and legal values exactly.
- Use current screen, agreement state and recent conversation as context.
- Do not ask questions whose answers are already supplied.
- Clarify only material ambiguity. Prefer one focused question with useful options.
- For navigation, select only a supplied navigation target id.
- For execution, select only a supplied capability key. Never invent a capability.
- Never invent SQL, database tables, API routes, provider SDK calls or hidden side effects.
- High-consequence financial, payroll, legal, destructive or irreversible actions require appropriate confirmation.
- For a voice turn, keep response_text concise and conversational unless detail is explicitly requested.
- Return strict JSON only with no markdown outside JSON.

Return:
{
  "response_text": "natural user response",
  "response_language": "BCP-47 language tag or null",
  "intent": "answer|clarify|navigate|execute|plan",
  "confidence": 0.0,
  "agreement_state": {},
  "clarification": {"required": false,"question": null,"options": []},
  "navigation": {"target_id": null},
  "execution": {"capability_key": null,"payload": {},"reason": null},
  "plan": []
}
`;

  const request = {
    user_input: {
      message: text(message),
      source: text(source) || "text",
      locale: text(locale) || null,
    },
    business_context: {
      organization_id: organizationId,
      entity_id: entityId,
      party_id: partyId,
      timezone: text(timezone) || null,
      current_screen: currentScreen || null,
    },
    agreement_state: object(agreementState),
    recent_conversation: boundedConversation(conversation, source),
    navigation_targets: boundedTargets(navigationTargets, message, source),
    executable_capabilities: boundedCapabilities(capabilities, message, source),
  };

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.reasoning.execute",
    input: {
      input: JSON.stringify(request),
      instructions_text: instructions,
      max_output_tokens: voice ? 700 : 1400,
      response_format: {
        type: "json_object",
      },
    },
    metadata: {
      module: "OPERATOR",
      operation: "REASON_TURN",
      channel: text(source) || "text",
      latency_class: voice ? "interactive" : "standard",
      catalog_counts: {
        navigation: request.navigation_targets.length,
        capabilities: request.executable_capabilities.length,
      },
    },
    category: "AI",
  });

  const rawText = findText(execution);
  const parsed = parseJson(rawText);

  if (!parsed) {
    throw new Error("OPERATOR_REASONING_INVALID_RESPONSE");
  }

  return {
    decision: normalizeDecision(parsed),
    provider_evidence: {
      provider: execution?.provider || null,
      model: execution?.model || null,
      usage_id: execution?.usage?.id || null,
      pricing_id: execution?.pricing?.pricing_id || null,
    },
  };
}
