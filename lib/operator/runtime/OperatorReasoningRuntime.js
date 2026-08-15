import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  normalizeOperatorProjectState,
} from "@/lib/operator/contracts/OperatorProjectState";

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
    .slice(voice ? -4 : -12)
    .map((message) => ({
      role: text(message?.role) === "assistant" ? "assistant" : "user",
      content: text(message?.content).slice(0, voice ? 900 : 6000),
    }))
    .filter((message) => message.content);
}

function voiceRankingContext({ message, projectState = {}, conversation = [] } = {}) {
  const state = normalizeOperatorProjectState(projectState);
  const recent = boundedConversation(conversation, "voice").slice(-3);

  return [
    text(message),
    text(state.objective),
    ...list(state.decisions).slice(-4).map(text),
    text(state.progress_summary),
    text(state.next_step),
    text(state.blocker),
    ...list(state.open_questions).slice(-3).map(text),
    ...recent.map((entry) => entry.content),
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 3600);
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
  const selected = ranked(targets, message, voice ? 12 : 120);

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

function compactSchema(inputSchema) {
  const properties = inputSchema?.properties;
  if (!properties || typeof properties !== "object") return null;

  const fields = Object.keys(properties);
  if (!fields.length) return null;

  const required = Array.isArray(inputSchema.required) ? inputSchema.required : [];

  return required.length ? { fields, required } : { fields };
}

function capabilityIndex(capabilities = []) {
  const domains = {};

  for (const capability of list(capabilities)) {
    const domain = text(capability.domain);
    const name = text(capability.capability);
    const action = text(capability.action);
    if (!domain || !name || !action) continue;

    domains[domain] = domains[domain] || {};
    domains[domain][name] = domains[domain][name] || new Set();
  }

  const index = {};
  for (const [domain, entries] of Object.entries(domains)) {
    index[domain] = Object.keys(entries)
      .sort()
      .map((name) => `${name}:${[...entries[name]].sort().join("|")}`);
  }

  return index;
}

function boundedCapabilities(capabilities = [], message = "", source = "text") {
  const voice = text(source).toLowerCase() === "voice";
  const selected = ranked(capabilities, message, voice ? 12 : 56);

  return selected.map((capability) => {
    const schema = compactSchema(capability.input_schema);

    return {
      key: capability.key,
      description: capability.description,
      mode: capability.mode,
      risk: capability.risk,
      ...(schema ? { input: schema } : {}),
      ...(capability.approval ? { approval: capability.approval } : {}),
      ...(capability.reversible ? { reversible: true } : {}),
      ...(capability.transactional ? { transactional: true } : {}),
    };
  });
}

function fastVoiceInstructions() {
  return `
You are Avantiqo Operator handling a live spoken turn.

Understand the current user message and respond quickly while preserving the intelligence and continuity of the ongoing business conversation.
Use current_project_state as durable memory of the goal. Use recent_conversation as immediate context.
For strategic follow-ups such as what should we do, what do you suggest, or what do you recommend, give a specific recommendation grounded in the recorded objective, decisions, constraints, progress, next step, blockers and recent conversation. Do not reset to generic advice.
When a strategic recommendation materially advances an active goal, update project_state.progress_summary with the current working direction and project_state.next_step with the best next step. Do not put an assistant-only recommendation into decisions.
Add or update project_state.decisions only when the user clearly accepts, chooses, rejects or commits to a material direction, or when a completed business action establishes that decision. Keep decisions concise and do not duplicate an existing decision.
Be a useful collaborative partner: develop the idea, identify the important tradeoff, and choose the best safe next step when the recorded context is sufficient.
Do not ask the user to repeat facts, decisions or constraints already present in current_project_state or recent_conversation.
Never mark a goal completed merely because one action or plan step completed. Preserve the active goal unless the user changes or clearly completes it.
Use only a supplied navigation target id or executable capability key.
Never invent a capability, route, fact, number, SQL statement, API call or side effect.
If the request clearly matches a supplied target or capability, route it.
If the request is conversational or can be answered without business data, answer directly.
If business data or an action is needed but none of the supplied candidates clearly matches, set needs_full_catalog to true instead of guessing.
If clarification is needed, ask one neutral question that does not assert business facts, set clarification.required to true, leave clarification.options empty, and copy that exact question into response_text.
Preserve the user's language. Keep spoken responses concise.
Return project_state only with fields that changed; otherwise return {}. The server preserves unchanged state.
Return exactly one JSON object and nothing else.

Return:
{
  "response_text":"short natural response",
  "response_language":null,
  "intent":"answer|clarify|navigate|execute|plan",
  "confidence":0.0,
  "needs_full_catalog":false,
  "agreement_state":{},
  "project_state":{},
  "clarification":{"required":false,"question":null,"options":[]},
  "navigation":{"target_id":null},
  "execution":{"capability_key":null,"payload":{},"reason":null},
  "plan":[]
}
`.trim();
}

function fastVoiceSafeClarification(parsed) {
  if (!parsed || normalizeIntent(parsed.intent) !== "clarify") return false;

  const clarification = object(parsed.clarification);
  const question = text(clarification.question);
  const responseText = text(
    parsed.response_text || parsed.response || parsed.message,
  );
  const capabilityKey = text(
    parsed?.execution?.capability_key || parsed?.capability_key,
  );
  const targetId = text(
    parsed?.navigation?.target_id || parsed?.navigation_target_id,
  );

  return (
    clarification.required === true &&
    Boolean(question) &&
    responseText === question &&
    list(clarification.options).length === 0 &&
    !capabilityKey &&
    !targetId
  );
}

function fastVoiceNeedsFallback(parsed, request) {
  if (!parsed) return true;

  const intent = normalizeIntent(parsed.intent);
  if (intent === "clarify") {
    return !fastVoiceSafeClarification(parsed);
  }

  if (parsed.needs_full_catalog === true) return true;

  const confidence = Number(parsed.confidence ?? 0);
  if (!Number.isFinite(confidence) || confidence < 0.72) return true;

  if (intent === "execute") {
    const capabilityKey = text(
      parsed?.execution?.capability_key || parsed?.capability_key,
    );
    if (
      !capabilityKey ||
      !request.executable_capabilities.some((item) => item.key === capabilityKey)
    ) {
      return true;
    }
  }

  if (intent === "navigate") {
    const targetId = text(
      parsed?.navigation?.target_id || parsed?.navigation_target_id,
    );
    if (
      !targetId ||
      !request.navigation_targets.some((item) => item.id === targetId)
    ) {
      return true;
    }
  }

  return false;
}

function providerEvidence(execution) {
  return {
    provider: execution?.provider || null,
    model: execution?.model || null,
    usage_id: execution?.usage?.id || null,
    pricing_id: execution?.pricing?.pricing_id || null,
  };
}

export function normalizeOperatorDecision(value = {}, { projectState = {} } = {}) {
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
    project_state: normalizeOperatorProjectState(decision.project_state, {
      previousState: projectState,
    }),
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
  projectState = {},
  conversation = [],
  navigationTargets = [],
  capabilities = [],
} = {}) {
  if (!organizationId) throw new Error("OPERATOR_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("OPERATOR_PARTY_REQUIRED");
  if (!text(message)) throw new Error("OPERATOR_MESSAGE_REQUIRED");

  const voice = text(source).toLowerCase() === "voice";

  if (voice) {
    const rankingContext = voiceRankingContext({
      message,
      projectState,
      conversation,
    });
    const fastRequest = {
      executable_capabilities: boundedCapabilities(
        capabilities,
        rankingContext,
        source,
      ),
      navigation_targets: boundedTargets(
        navigationTargets,
        rankingContext,
        source,
      ),
      business_context: {
        organization_id: organizationId,
        entity_id: entityId,
        party_id: partyId,
        timezone: text(timezone) || null,
        current_screen: currentScreen || null,
      },
      current_project_state: normalizeOperatorProjectState(projectState),
      agreement_state: object(agreementState),
      recent_conversation: boundedConversation(conversation, source),
      user_input: {
        message: text(message),
        source: "voice",
        locale: text(locale) || null,
      },
    };

    try {
      const fastExecution = await ServiceExecutionRuntime.execute({
        organization_id: organizationId,
        party_id: partyId,
        entity_id: entityId,
        service_id: "ai.text.generate",
        input: {
          input: JSON.stringify(fastRequest),
          instructions_text: fastVoiceInstructions(),
          max_output_tokens: 320,
          response_format: {
            type: "json_object",
          },
        },
        metadata: {
          module: "OPERATOR",
          operation: "REASON_TURN_FAST",
          channel: "voice",
          latency_class: "realtime",
          fast_path: true,
          contextual_ranking: true,
          catalog_counts: {
            navigation: fastRequest.navigation_targets.length,
            capabilities: fastRequest.executable_capabilities.length,
          },
        },
        category: "AI",
      });

      const fastParsed = parseJson(findText(fastExecution));
      if (!fastVoiceNeedsFallback(fastParsed, fastRequest)) {
        return {
          decision: normalizeOperatorDecision(fastParsed, { projectState }),
          provider_evidence: providerEvidence(fastExecution),
        };
      }
    } catch (fastError) {
      console.error("OPERATOR_FAST_REASONING_FALLBACK", fastError);
    }
  }

  const instructions = `
You are Avantiqo Operator, the conversational operating interface for a business operating system.

Understand the user's request, act as a thoughtful collaborative partner, and when sufficiently clear select a real supplied navigation target or capability.

Rules:
- Reply in the user's current language unless they explicitly request another language.
- Preserve business names, product names, people names and legal values exactly.
- Use current screen, agreement state and recent conversation as context.
- Use current_project_state as the durable memory of the goal you and the user are pursuing.
- Be a useful sounding board: develop ideas, identify tradeoffs, and challenge assumptions constructively when the user wants discussion.
- When a recommendation materially advances an active goal, update project_state.progress_summary with the current working direction and project_state.next_step with the best next step. An assistant-only recommendation is not yet a decision.
- Add or update project_state.decisions only when the user clearly accepts, chooses, rejects or commits to a material direction, or when a completed business action establishes that decision. Keep decisions concise and do not duplicate an existing decision.
- Continue an active goal from the best safe next step. Do not repeatedly ask the user to restate the goal or facts already recorded.
- When the goal changes, return a complete project_state snapshot. Preserve the current goal when the turn does not change it.
- Never mark a goal completed merely because one action or plan step completed. Use awaiting_confirmation and ask whether the outcome meets the user's goal.
- Set status to completed and user_confirmed_complete to true only after the user clearly confirms that the goal is reached. Use cancelled only when the user cancels or replaces the goal.
- Do not ask questions whose answers are already supplied.
- Clarify only material ambiguity. Prefer one focused question with useful options.
- For navigation, select only a supplied navigation target id.
- For execution, select only a supplied capability key. Never invent a capability.
- capability_index lists every capability that exists, as domain then "capability:action|action". executable_capabilities is only the subset ranked as most relevant this turn, with detail. A key built from capability_index is valid and executable even when it is absent from executable_capabilities, so use it.
- Before saying a capability is unavailable, check capability_index. Do not claim you cannot see data that a listed capability would return.
- Business questions rarely name the record that answers them. Translate the question into the artefact that holds the answer using your own domain knowledge: totals and income or profit come from the ledger, trial balance or management reporting capabilities rather than from a capability literally called income. Choose the capability an accountant or operator would open.
- When a question needs figures, read the data and answer with it. Do not offer to calculate and then stop, and do not promise a calculation you did not perform.
- Never invent SQL, database tables, API routes, provider SDK calls or hidden side effects.
- High-consequence financial, payroll, legal, destructive or irreversible actions require appropriate confirmation.
- Drafting is not sending, and preparing content is not publishing. External messages and publication must use supplied capabilities and remain subject to their confirmation and approval policies.
- For Avantiqo system management, use the supplied system health inspection before proposing a repair. Base the diagnosis only on returned evidence.
- Follow the management loop: inspect, diagnose, propose the smallest registered repair or incident action, obtain confirmation when required, execute, then run the supplied health verification before claiming the issue is fixed.
- A health inspection never authorizes a repair. Never invent shell commands, database mutations, deployment steps, retries, or provider calls when no matching capability exists.
- Do not automatically retry external messages: a provider may have accepted a message before returning an error.
- When current_project_state contains last_system_snapshot, use its snapshot id for a follow-up verification and compare status and diagnosis codes before claiming improvement.
- For a voice turn, keep response_text concise and conversational unless detail is explicitly requested.
- Return exactly one valid json object with no markdown or other text outside it.

Return:
{
  "response_text": "natural user response",
  "response_language": "BCP-47 language tag or null",
  "intent": "answer|clarify|navigate|execute|plan",
  "confidence": 0.0,
  "agreement_state": {},
  "project_state": {
    "objective": null,
    "status": "idle|discussing|active|blocked|awaiting_confirmation|completed|cancelled",
    "success_criteria": [],
    "constraints": [],
    "decisions": [],
    "completed_steps": [],
    "progress_summary": null,
    "next_step": null,
    "open_questions": [],
    "blocker": null,
    "last_system_snapshot": null,
    "user_confirmed_complete": false
  },
  "clarification": {"required": false,"question": null,"options": []},
  "navigation": {"target_id": null},
  "execution": {"capability_key": null,"payload": {},"reason": null},
  "plan": []
}
`;

  const request = {
    capability_index: capabilityIndex(capabilities),
    executable_capabilities: boundedCapabilities(capabilities, message, source),
    navigation_targets: boundedTargets(navigationTargets, message, source),
    business_context: {
      organization_id: organizationId,
      entity_id: entityId,
      party_id: partyId,
      timezone: text(timezone) || null,
      current_screen: currentScreen || null,
    },
    current_project_state: normalizeOperatorProjectState(projectState),
    agreement_state: object(agreementState),
    recent_conversation: boundedConversation(conversation, source),
    user_input: {
      message: text(message),
      source: text(source) || "text",
      locale: text(locale) || null,
    },
    output_contract: {
      format: "json_object",
      instruction:
        "Answer user_input.message, the final and current turn. Earlier entries in recent_conversation are context only and must not be answered again. Return exactly one valid json object and no text outside it.",
    },
  };

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.reasoning.execute",
    input: {
      input: JSON.stringify(request),
      instructions_text: instructions,
      max_output_tokens: voice ? 480 : 1400,
      response_format: {
        type: "json_object",
      },
    },
    metadata: {
      module: "OPERATOR",
      operation: "REASON_TURN",
      channel: text(source) || "text",
      latency_class: voice ? "interactive" : "standard",
      fallback_from_fast_voice: voice,
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
    decision: normalizeOperatorDecision(parsed, { projectState }),
    provider_evidence: providerEvidence(execution),
  };
}