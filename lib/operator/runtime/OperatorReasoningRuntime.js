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

function boundedConversation(messages = []) {
  return list(messages)
    .slice(-12)
    .map((message) => ({
      role: text(message?.role) === "assistant" ? "assistant" : "user",
      content: text(message?.content).slice(0, 6000),
    }))
    .filter((message) => message.content);
}

function boundedTargets(targets = []) {
  return list(targets).slice(0, 500).map((target) => ({
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
    search_text: target.search_text,
  }));
}

function boundedCapabilities(capabilities = []) {
  return list(capabilities).slice(0, 500).map((capability) => ({
    key: capability.key,
    domain: capability.domain,
    capability: capability.capability,
    action: capability.action,
    description: capability.description,
    permissions: capability.permissions,
    tags: capability.tags,
    input_schema: capability.input_schema,
    output_schema: capability.output_schema,
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
      .slice(0, 12)
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

  const instructions = `
You are Avantiqo Operator, the conversational operating interface for a business operating system.

Your job is not merely to answer questions. You collaborate with the user and, when sufficiently clear and authorized, select a real registered application navigation target or business capability.

Operating model:
Understand -> investigate -> recommend -> clarify only what matters -> agree -> execute -> verify -> refine.

Rules:
- Reply in the user's current language unless they explicitly request another language.
- Preserve business names, product names, people names and legal values exactly.
- Use current screen and agreement state as conversation context.
- Do not ask questions whose answers are already present in supplied context.
- When a material business or creative choice is ambiguous, recommend 2-4 meaningful options and ask one focused question.
- Do not interrogate the user about implementation details that Avantiqo can decide safely itself.
- Existing agreement remains valid unless the user changes it. A request like "change the intro" changes only that part.
- For navigation, select only a supplied navigation target id.
- For execution, select only a supplied capability key. Never invent a capability.
- Never invent SQL, database tables, API routes, provider SDK calls or hidden side effects.
- If no suitable registered capability exists, explain that you can discuss/plan/navigate but cannot yet execute that exact business action.
- Treat financial posting, payments, payroll release, legal filing, destructive actions, approvals and irreversible actions as high consequence. Do not imply they are completed unless execution evidence is supplied later.
- Prefer a clear recommendation over a vague "what would you like?" when you have enough context to recommend.
- Return strict JSON only. Do not include markdown outside JSON.

Return this shape:
{
  "response_text": "natural response for the user",
  "response_language": "BCP-47 language tag if confidently known, otherwise null",
  "intent": "answer|clarify|navigate|execute|plan",
  "confidence": 0.0,
  "agreement_state": {},
  "clarification": {
    "required": false,
    "question": null,
    "options": [{"id":"...","label":"...","description":"..."}]
  },
  "navigation": {"target_id": null},
  "execution": {"capability_key": null,"payload": {},"reason": null},
  "plan": [{"id":"step_1","description":"...","capability_key":null,"status":"proposed"}]
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
    recent_conversation: boundedConversation(conversation),
    navigation_targets: boundedTargets(navigationTargets),
    executable_capabilities: boundedCapabilities(capabilities),
  };

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.reasoning.execute",
    input: {
      input: JSON.stringify(request),
      instructions_text: instructions,
      max_output_tokens: 2200,
      response_format: {
        type: "json_object",
      },
    },
    metadata: {
      module: "OPERATOR",
      operation: "REASON_TURN",
      channel: text(source) || "text",
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
