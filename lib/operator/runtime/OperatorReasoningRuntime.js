import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  normalizeOperatorProjectState,
} from "@/lib/operator/contracts/OperatorProjectState";

const OPERATOR_READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const ENTITY_CONTEXT_QUESTION = "Which legal entity should I use for this request?";
const FAST_VOICE_PRIMARY_CAPABILITY_LIMIT = 12;
const FAST_VOICE_READ_SUPPLEMENT_LIMIT = 6;
const FAST_VOICE_CAPABILITY_LIMIT =
  FAST_VOICE_PRIMARY_CAPABILITY_LIMIT + FAST_VOICE_READ_SUPPLEMENT_LIMIT;

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
    ...list(state.completed_steps).slice(-3).map(text),
    text(state.blocker),
    ...list(state.open_questions).slice(-3).map(text),
    ...recent.map((entry) => entry.content),
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 3600);
}

function validTimezone(value) {
  const candidate = text(value) || "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

function calendarIso(date) {
  return date.toISOString().slice(0, 10);
}

function calendarDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function dateWindow(start, end = start) {
  return {
    date_from: calendarIso(start),
    date_to: calendarIso(end),
  };
}

function temporalReference(timezone) {
  const zone = validTimezone(timezone);
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(byType.year);
  const month = Number(byType.month);
  const day = Number(byType.day);
  const today = calendarDate(year, month, day);
  const yesterday = calendarDate(year, month, day - 1);
  const weekday = today.getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const thisWeekStart = calendarDate(year, month, day - mondayOffset);
  const thisWeekEnd = calendarDate(
    thisWeekStart.getUTCFullYear(),
    thisWeekStart.getUTCMonth() + 1,
    thisWeekStart.getUTCDate() + 6,
  );
  const lastWeekStart = calendarDate(
    thisWeekStart.getUTCFullYear(),
    thisWeekStart.getUTCMonth() + 1,
    thisWeekStart.getUTCDate() - 7,
  );
  const lastWeekEnd = calendarDate(
    thisWeekStart.getUTCFullYear(),
    thisWeekStart.getUTCMonth() + 1,
    thisWeekStart.getUTCDate() - 1,
  );
  const thisMonthStart = calendarDate(year, month, 1);
  const thisMonthEnd = calendarDate(year, month + 1, 0);
  const lastMonthStart = calendarDate(year, month - 1, 1);
  const lastMonthEnd = calendarDate(year, month, 0);
  const quarter = Math.floor((month - 1) / 3);
  const thisQuarterStart = calendarDate(year, quarter * 3 + 1, 1);
  const thisQuarterEnd = calendarDate(year, quarter * 3 + 4, 0);
  const previousQuarterAnchor = calendarDate(year, quarter * 3 - 2, 1);
  const lastQuarterStart = calendarDate(
    previousQuarterAnchor.getUTCFullYear(),
    previousQuarterAnchor.getUTCMonth() + 1,
    1,
  );
  const lastQuarterEnd = calendarDate(
    lastQuarterStart.getUTCFullYear(),
    lastQuarterStart.getUTCMonth() + 4,
    0,
  );
  const yearStart = calendarDate(year, 1, 1);
  const yearEnd = calendarDate(year, 12, 31);

  return {
    timezone: zone,
    generated_at_utc: now.toISOString(),
    local_date: calendarIso(today),
    local_time: `${byType.hour}:${byType.minute}:${byType.second}`,
    weekday: byType.weekday || null,
    week_starts_on: "monday",
    windows: {
      today: dateWindow(today),
      yesterday: dateWindow(yesterday),
      this_week: dateWindow(thisWeekStart, thisWeekEnd),
      last_week: dateWindow(lastWeekStart, lastWeekEnd),
      this_month: dateWindow(thisMonthStart, thisMonthEnd),
      last_month: dateWindow(lastMonthStart, lastMonthEnd),
      this_quarter: dateWindow(thisQuarterStart, thisQuarterEnd),
      last_quarter: dateWindow(lastQuarterStart, lastQuarterEnd),
      year_to_date: dateWindow(yearStart, today),
      this_year: dateWindow(yearStart, yearEnd),
    },
  };
}

const BUSINESS_SEMANTIC_HINT_RULES = Object.freeze([
  {
    pattern: /\b(?:revenue|income|sales|earnings|turnover|takings)\b/i,
    hints: ["revenue", "sales", "income", "profit", "loss", "ledger", "report", "reporting", "orders", "invoices"],
  },
  {
    pattern: /\b(?:how much|what)\s+(?:did|do|have)\s+we\s+(?:make|made|earn|earned)\b/i,
    hints: ["revenue", "sales", "income", "profit", "loss", "ledger", "report", "reporting", "orders", "invoices"],
  },
  {
    pattern: /\b(?:profit|margin|gross profit|net profit|net income)\b/i,
    hints: ["profit", "loss", "margin", "revenue", "cost", "expense", "ledger", "report", "reporting"],
  },
  {
    pattern: /\b(?:cost|costs|expense|expenses|spend|spending|burn)\b/i,
    hints: ["cost", "expense", "purchases", "payables", "vendor", "invoice", "budget", "ledger", "report"],
  },
  {
    pattern: /\b(?:cash|bank|liquidity|treasury|cashflow|cash flow)\b/i,
    hints: ["cash", "flow", "bank", "balance", "liquidity", "treasury", "payments", "report"],
  },
  {
    pattern: /\b(?:receivable|receivables|customer invoice|customer invoices|money owed to us|customers owe)\b/i,
    hints: ["customer", "invoice", "receivable", "aging", "collection", "revenue", "report"],
  },
  {
    pattern: /\b(?:payable|payables|vendor invoice|vendor invoices|supplier invoice|supplier invoices|bills due)\b/i,
    hints: ["vendor", "supplier", "invoice", "payable", "aging", "purchase", "payment", "report"],
  },
  {
    pattern: /\b(?:inventory|stock|on hand|warehouse|valuation)\b/i,
    hints: ["inventory", "stock", "warehouse", "movement", "valuation", "item", "availability"],
  },
  {
    pattern: /\b(?:payroll|salary|salaries|wage|wages|compensation|payslip|payslips)\b/i,
    hints: ["payroll", "salary", "wage", "compensation", "payslip", "attendance", "payment"],
  },
  {
    pattern: /\b(?:customer|customers|client|clients|lead|leads|crm)\b/i,
    hints: ["customer", "client", "crm", "sales", "quote", "order", "communication"],
  },
  {
    pattern: /\b(?:order|orders|booking|bookings|reservation|reservations)\b/i,
    hints: ["order", "sales", "booking", "reservation", "customer", "transaction", "pos"],
  },
  {
    pattern: /\b(?:performance|kpi|kpis|metric|metrics|trend|trends|dashboard|analytics)\b/i,
    hints: ["performance", "kpi", "metric", "analytics", "dashboard", "report", "summary", "trend"],
  },
]);

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

function semanticTokens(value) {
  const source = text(value);
  const hints = [];

  for (const rule of BUSINESS_SEMANTIC_HINT_RULES) {
    if (rule.pattern.test(source)) hints.push(...rule.hints);
  }

  return Array.from(new Set(hints)).slice(0, 24);
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

function rankedCapabilities(items, message, limit) {
  const source = list(items);
  if (source.length <= limit) return source;

  const literalTokens = tokens(message);
  const hintTokens = semanticTokens(message);
  if (!literalTokens.length && !hintTokens.length) return source.slice(0, limit);

  return source
    .map((item, index) => ({
      item,
      index,
      score:
        relevanceScore(item, literalTokens) +
        relevanceScore(item, hintTokens) * 0.45,
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
  if (!inputSchema || typeof inputSchema !== "object") return null;

  const properties =
    inputSchema.properties && typeof inputSchema.properties === "object"
      ? inputSchema.properties
      : {};
  const fields = Object.keys(properties);
  const required = Array.isArray(inputSchema.required) ? inputSchema.required : [];
  const open = inputSchema.additionalProperties === true;

  if (!fields.length && !open) return null;

  return {
    fields,
    ...(required.length ? { required } : {}),
    ...(open ? { open: true } : {}),
  };
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
    domains[domain][name].add(action);
  }

  const index = {};
  for (const [domain, entries] of Object.entries(domains)) {
    index[domain] = Object.keys(entries)
      .sort()
      .map((name) => `${name}:${[...entries[name]].sort().join("|")}`);
  }

  return index;
}

function fastVoiceCapabilities(capabilities = [], message = "") {
  const primary = rankedCapabilities(
    capabilities,
    message,
    FAST_VOICE_PRIMARY_CAPABILITY_LIMIT,
  );
  const selectedKeys = new Set(primary.map((item) => text(item?.key)).filter(Boolean));
  const supplementalReads = rankedCapabilities(
    list(capabilities).filter(
      (item) =>
        text(item?.mode).toLowerCase() === "read" &&
        !selectedKeys.has(text(item?.key)),
    ),
    message,
    FAST_VOICE_READ_SUPPLEMENT_LIMIT,
  );

  return [...primary, ...supplementalReads].slice(0, FAST_VOICE_CAPABILITY_LIMIT);
}

function boundedCapabilities(capabilities = [], message = "", source = "text") {
  const voice = text(source).toLowerCase() === "voice";
  const selected = voice
    ? fastVoiceCapabilities(capabilities, message)
    : rankedCapabilities(capabilities, message, 56);

  return selected.map((capability) => {
    const schema = compactSchema(capability.input_schema);
    const contextScope = text(capability.context_scope).toLowerCase();

    return {
      key: capability.key,
      description: capability.description,
      mode: capability.mode,
      risk: capability.risk,
      ...(["organization", "entity"].includes(contextScope)
        ? { context_scope: contextScope }
        : {}),
      ...(schema ? { input: schema } : {}),
      ...(capability.approval ? { approval: capability.approval } : {}),
      ...(capability.reversible ? { reversible: true } : {}),
      ...(capability.transactional ? { transactional: true } : {}),
    };
  });
}

function capabilityForKey(capabilities = [], key) {
  const target = text(key);
  if (!target) return null;
  return list(capabilities).find((item) => text(item?.key) === target) || null;
}

function readChainExecutionKeys(execution = {}) {
  const payload = object(execution.payload);
  const keys = [];

  for (const step of list(payload.steps)) {
    const childKey = text(step?.capability_key);
    if (childKey) keys.push(childKey);
  }

  const followUp = object(payload.follow_up);
  const followUpKey = text(followUp.capability_key);
  if (followUpKey) keys.push(followUpKey);

  const verifyAfterKey = text(object(followUp.verify_after).capability_key);
  if (verifyAfterKey) keys.push(verifyAfterKey);

  return keys;
}

function readChainHasFollowUp(parsed) {
  const execution = object(parsed?.execution);
  const capabilityKey = text(
    execution.capability_key || parsed?.capability_key,
  );
  if (capabilityKey !== OPERATOR_READ_CHAIN_KEY) return false;
  return Boolean(text(object(execution.payload?.follow_up).capability_key));
}

function executionNeedsEntity(
  parsed,
  capabilities,
  entityId,
  { unknownReadChainChildRequiresFallback = false } = {},
) {
  if (text(entityId)) return false;

  const execution = object(parsed?.execution);
  const capabilityKey = text(
    execution.capability_key || parsed?.capability_key,
  );
  if (!capabilityKey) return false;

  const keys = [capabilityKey];
  if (capabilityKey === OPERATOR_READ_CHAIN_KEY) {
    for (const childKey of readChainExecutionKeys(execution)) {
      if (
        unknownReadChainChildRequiresFallback &&
        !capabilityForKey(capabilities, childKey)
      ) {
        return true;
      }
      keys.push(childKey);
    }
  }

  return keys.some((key) =>
    text(capabilityForKey(capabilities, key)?.context_scope).toLowerCase() === "entity",
  );
}

function entityContextClarification(parsed) {
  return {
    ...object(parsed),
    response_text: ENTITY_CONTEXT_QUESTION,
    intent: "clarify",
    confidence: Math.max(Number(parsed?.confidence || 0), 0.9),
    capability_key: null,
    navigation_target_id: null,
    clarification: {
      required: true,
      question: ENTITY_CONTEXT_QUESTION,
      options: [],
    },
    navigation: { target_id: null },
    execution: { capability_key: null, payload: {}, reason: null },
    plan: [],
  };
}

function fastVoiceInstructions() {
  return `
You are Avantiqo Operator handling a live spoken turn.

Understand the current user message and respond quickly while preserving the intelligence and continuity of the ongoing business conversation.
Use current_project_state as durable memory of the goal. Use recent_conversation as immediate context.
For strategic follow-ups such as what should we do, what do you suggest, or what do you recommend, give a specific recommendation grounded in the recorded objective, decisions, constraints, progress, next step, blockers and recent conversation. Do not reset to generic advice.
When a strategic recommendation materially advances an active goal, update project_state.progress_summary with the current working direction and project_state.next_step with the best next step. Do not put an assistant-only recommendation into decisions.
Add or update project_state.decisions only when the user clearly accepts, chooses, rejects or commits to a material direction, or when a completed business action establishes that decision. Keep decisions concise and do not duplicate an existing decision.
Treat current_project_state.completed_steps as work already completed. Do not propose or execute the same completed step again unless the user explicitly asks to repeat it, verified evidence says it is stale or failed, or the requested operation is materially different.
Be a useful collaborative partner: develop the idea, identify the important tradeoff, and choose the best safe next step when the recorded context is sufficient.
Do not ask the user to repeat facts, decisions or constraints already present in current_project_state or recent_conversation.
Never mark a goal completed merely because one action or plan step completed. Preserve the active goal unless the user changes or clearly completes it.
Use only a supplied navigation target id or executable capability key.
Never invent a capability, route, fact, number, SQL statement, API call or side effect.
Treat executable_capabilities[].context_scope as authoritative. If the needed capability has context_scope "entity" and business_context.entity_id is missing, do not execute it: ask one focused clarification for the legal entity and never guess one. Apply the same rule to every read step, follow_up action, and follow_up.verify_after read inside platform.operator_read_chain.execute.
If the user's request requires evidence-first reads followed by a downstream business action, do not construct the follow_up on the fast spoken path. Set needs_full_catalog to true so full reasoning can validate the exact action, payload, entity scope, confirmation, and verification plan.
For a request asking for a number, status, records, history, totals, a summary, or another business fact, prefer a supplied read capability and execute it in this turn. Do not navigate to a workspace instead when a read can answer the request, and do not stop at saying you can retrieve the data.
Use navigation only when the user explicitly asks to open, go to, switch to, or show a workspace/page rather than asking for the business information itself.
Resolve relative calendar phrases such as today, yesterday, this week, last week, this month, last month, this quarter, last quarter and year to date only from business_context.temporal_reference. Never guess the current date from model knowledge or server UTC.
When a relative period is part of a read request, send explicit YYYY-MM-DD filters from the matching temporal_reference window. Use named capability input fields when supplied. If the capability input is open and provides no named date fields, use date_from and date_to. Never send vague values such as "yesterday" as a date filter.
If the request clearly matches a supplied target or capability, route it.
If the request is conversational or can be answered without business data, answer directly.
If business data or an action is needed but none of the supplied candidates clearly matches, set needs_full_catalog to true instead of guessing.
If clarification is needed, ask one neutral question that does not assert business facts, set clarification.required to true, leave clarification.options empty, and copy that exact question into response_text.
Do not begin with filler acknowledgements such as "Got it", "Sure", "Okay", "Let me check", or "One moment". Start with the actual answer or the clarification question.
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
  const normalizedQuestion = question.toLocaleLowerCase();
  const normalizedResponse = responseText.toLocaleLowerCase();
  const responseAligned =
    normalizedResponse === normalizedQuestion ||
    normalizedResponse.endsWith(normalizedQuestion);

  return (
    clarification.required === true &&
    Boolean(question) &&
    responseAligned &&
    list(clarification.options).length === 0 &&
    !capabilityKey &&
    !targetId
  );
}

function fastVoiceFallbackReason(parsed, request) {
  if (!parsed) return "invalid_response";

  const intent = normalizeIntent(parsed.intent);
  if (intent === "clarify") {
    return fastVoiceSafeClarification(parsed) ? null : "unsafe_clarification";
  }

  if (parsed.needs_full_catalog === true) return "full_catalog_requested";

  const confidence = Number(parsed.confidence ?? 0);
  if (!Number.isFinite(confidence) || confidence < 0.55) {
    return "low_confidence";
  }

  if (intent === "execute") {
    const capabilityKey = text(
      parsed?.execution?.capability_key || parsed?.capability_key,
    );
    if (!capabilityKey) return "missing_capability";
    if (!request.executable_capabilities.some((item) => item.key === capabilityKey)) {
      return "unknown_capability";
    }

    if (readChainHasFollowUp(parsed)) return "read_chain_follow_up";

    if (
      executionNeedsEntity(
        parsed,
        request.executable_capabilities,
        request.business_context?.entity_id,
        { unknownReadChainChildRequiresFallback: true },
      )
    ) {
      return "entity_or_unknown_read_chain_scope";
    }
  }

  if (intent === "navigate") {
    const targetId = text(
      parsed?.navigation?.target_id || parsed?.navigation_target_id,
    );
    if (!targetId) return "missing_navigation_target";
    if (!request.navigation_targets.some((item) => item.id === targetId)) {
      return "unknown_navigation_target";
    }
  }

  return null;
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
  const temporal = temporalReference(timezone);
  let fastVoiceFallbackReasonCode = null;

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
        timezone: temporal.timezone,
        temporal_reference: temporal,
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
          max_output_tokens: 180,
          text: {
            verbosity: "low",
          },
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
          semantic_capability_ranking: true,
          fast_voice_read_catalog_expansion: true,
          temporal_grounding: true,
          completed_step_context: true,
          entity_scope_guard: true,
          read_chain_nested_entity_guard: true,
          fast_voice_follow_up_fallback: true,
          no_filler_response: true,
          catalog_counts: {
            navigation: fastRequest.navigation_targets.length,
            capabilities: fastRequest.executable_capabilities.length,
          },
        },
        category: "AI",
      });

      const fastParsed = parseJson(findText(fastExecution));
      fastVoiceFallbackReasonCode = fastVoiceFallbackReason(fastParsed, fastRequest);
      if (!fastVoiceFallbackReasonCode) {
        return {
          decision: normalizeOperatorDecision(fastParsed, { projectState }),
          provider_evidence: providerEvidence(fastExecution),
        };
      }
    } catch (fastError) {
      fastVoiceFallbackReasonCode = "fast_execution_error";
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
- Treat current_project_state.completed_steps as work already completed. Do not propose or execute the same completed step again unless the user explicitly asks to repeat it, verified evidence says it is stale or failed, or the requested operation is materially different.
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
- Treat executable_capabilities[].context_scope as authoritative. If a needed capability has context_scope "entity" and business_context.entity_id is missing, do not execute it. Ask one focused clarification for the legal entity and never guess one. When using platform.operator_read_chain.execute, apply this rule to every read step, follow_up action, and follow_up.verify_after read.
- When the user's current request explicitly asks for a downstream business action whose correctness depends on current business state, use platform.operator_read_chain.execute with 1 to 4 exact read steps and an exact follow_up action instead of executing the write directly from assumptions.
- Never create a follow_up merely because you recommend an action. A recommendation alone is not authorization; the user's current request must explicitly ask for that downstream action after the evidence check.
- A read-chain follow_up must name one real registered non-read capability and include the exact material payload needed for that action. If a material value is missing or ambiguous, clarify instead of inventing it.
- Read evidence never auto-authorizes a write. The read chain only stages follow_up; verification must support that exact action, the user must explicitly confirm it, and normal permissions and approval governance still apply before execution.
- When a registered read can independently verify the business effect after the action, include follow_up.verify_after with that exact read capability and payload. Do not invent a verification read when none is available.
- Do not replace the user's explicitly requested action with a different action merely because the evidence suggests it. If the exact requested action is unsupported by the evidence, report that and do not stage another write automatically.
- Business questions rarely name the record that answers them. Translate the question into the artefact that holds the answer using your own domain knowledge: totals and income or profit come from the ledger, trial balance or management reporting capabilities rather than from a capability literally called income. Choose the capability an accountant or operator would open.
- For a request asking for a number, status, records, history, totals, a summary, or another business fact, execute the best matching read capability in this turn. Do not navigate to a workspace instead when a read can answer the request, and do not answer with an offer to retrieve data later.
- Navigation is for explicit requests to open, go to, switch to, or show a workspace/page. A request for the information shown on a page is a read request, not a navigation request.
- Resolve relative calendar phrases such as today, yesterday, this week, last week, this month, last month, this quarter, last quarter and year to date only from business_context.temporal_reference. Never infer the current date from model knowledge, UTC, or conversation age.
- When a relative period is part of a read request, send explicit YYYY-MM-DD filters from the matching temporal_reference window. Use named capability input fields when supplied. If the capability input is open and provides no named date fields, use date_from and date_to. Never send vague relative phrases as date values.
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
      timezone: temporal.timezone,
      temporal_reference: temporal,
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
      ...(voice && fastVoiceFallbackReasonCode
        ? { fast_voice_fallback_reason: fastVoiceFallbackReasonCode }
        : {}),
      semantic_capability_ranking: true,
      temporal_grounding: true,
      completed_step_context: true,
      entity_scope_guard: true,
      read_chain_nested_entity_guard: true,
      evidence_first_mixed_action: true,
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

  const guardedParsed = executionNeedsEntity(parsed, capabilities, entityId)
    ? entityContextClarification(parsed)
    : parsed;

  return {
    decision: normalizeOperatorDecision(guardedParsed, { projectState }),
    provider_evidence: providerEvidence(execution),
  };
}
