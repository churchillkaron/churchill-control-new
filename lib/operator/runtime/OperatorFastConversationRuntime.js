import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function text(value) {
  return String(value ?? "").trim();
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
    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }

  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }

  return "";
}

const CASUAL_PATTERNS = [
  /^how are you[?.! ]*$/i,
  /^how'?s it going[?.! ]*$/i,
  /^how are things[?.! ]*$/i,
  /^hello[?.! ]*$/i,
  /^hi[?.! ]*$/i,
  /^hey[?.! ]*$/i,
  /^good (morning|afternoon|evening)[?.! ]*$/i,
  /^thank(s| you)[?.! ]*$/i,
  /^who are you[?.! ]*$/i,
  /^what('?s| is) your name[?.! ]*$/i,
  /^wie geht('?s| es dir)?[?.! ]*$/i,
  /^hallo[?.! ]*$/i,
  /^hej[?.! ]*$/i,
  /^hur mår du[?.! ]*$/i,
  /^bonjour[?.! ]*$/i,
  /^comment ça va[?.! ]*$/i,
  /^hola[?.! ]*$/i,
  /^cómo estás[?.! ]*$/i,
  /^ciao[?.! ]*$/i,
  /^come stai[?.! ]*$/i,
  /^สวัสดี[?.! ]*$/i,
  /^เป็นไงบ้าง[?.! ]*$/i,
];

const SIMPLE_QUESTION_PATTERN = /^(what|who|when|where|why|how|is|are|do|does|did|can|could|would|will)\b/i;
const BUSINESS_OR_ACTION_PATTERN = /\b(create|draft|write|send|post|publish|delete|remove|update|change|pay|refund|approve|reject|execute|fix|repair|open|navigate|show|list|check|manage|schedule|book|cancel|invoice|customer|supplier|employee|payroll|finance|revenue|expense|sales|stock|inventory|project|campaign|studio|asset|report|dashboard|system|workspace)\b/i;

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+\-*/.\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function arithmeticReply(message) {
  const expression = normalized(message)
    .replace(/^(what is|what s|calculate|compute)\s+/, "")
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .replace(/\b(times|multiplied by)\b/g, "*")
    .replace(/\b(divided by|over)\b/g, "/")
    .trim();
  const match = expression.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const left = Number(match[1]);
  const right = Number(match[3]);
  const operator = match[2];
  if (operator === "/" && right === 0) return "That cannot be divided by zero.";

  const result = operator === "+"
    ? left + right
    : operator === "-"
      ? left - right
      : operator === "*"
        ? left * right
        : left / right;
  if (!Number.isFinite(result)) return null;

  return `${match[1]} ${operator} ${match[3]} is ${Number(result.toFixed(8))}.`;
}

export function instantConversationReply({
  message,
  locale = null,
  timezone = null,
  now = new Date(),
} = {}) {
  const clean = normalized(message);
  if (!clean) return null;

  const arithmetic = arithmeticReply(clean);
  if (arithmetic) return arithmetic;

  if (/^(hello|hi|hey|good morning|good afternoon|good evening)$/.test(clean)) {
    return "Hi. I'm here and ready.";
  }
  if (/^(how are you|how s it going|how are things)$/.test(clean)) {
    return "I'm good, focused, and ready to work with you.";
  }
  if (/^(thank you|thanks)$/.test(clean)) return "You're welcome.";
  if (/^(are you there|are you listening|can you hear me)$/.test(clean)) {
    return "Yes, I'm here and listening.";
  }
  if (/^(who are you|what is your name|what s your name)$/.test(clean)) {
    return "I'm Avantiqo, your business partner inside Avantiqo.";
  }
  if (/^(what can you do|how can you help|help)$/.test(clean)) {
    return "I can discuss ideas, answer questions, navigate Avantiqo, prepare work, and execute approved business actions with you.";
  }
  if (/^(what time is it|what s the time|what is the time)$/.test(clean)) {
    const formatted = new Intl.DateTimeFormat(locale || "en", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
    return `It is ${formatted}.`;
  }
  if (/^(what day is it|what is the date|what s the date|what date is it)$/.test(clean)) {
    const formatted = new Intl.DateTimeFormat(locale || "en", {
      timeZone: timezone || "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(now);
    return `It is ${formatted}.`;
  }

  return null;
}

export function isFastConversationTurn({ message, source, locale, timezone } = {}) {
  if (text(source).toLowerCase() !== "voice") return false;

  const clean = text(message);
  if (!clean || clean.length > 160) return false;

  if (instantConversationReply({ message: clean, locale, timezone })) return true;

  if (CASUAL_PATTERNS.some((pattern) => pattern.test(clean))) return true;

  return SIMPLE_QUESTION_PATTERN.test(clean) &&
    !BUSINESS_OR_ACTION_PATTERN.test(clean);
}

export async function runFastConversationTurn({
  organizationId,
  partyId,
  entityId = null,
  locale = null,
  timezone = null,
  message,
  conversation = [],
  agreementState = {},
  projectState = {},
} = {}) {
  const instantReply = instantConversationReply({
    message,
    locale,
    timezone,
  });
  if (instantReply) {
    return {
      success: true,
      decision: {
        response_text: instantReply,
        response_language: text(locale) || null,
        intent: "answer",
        confidence: 1,
        agreement_state: agreementState,
        project_state: projectState,
        clarification: { required: false, question: null, options: [] },
        navigation: { target_id: null },
        execution: { capability_key: null, payload: {}, reason: null },
        plan: [],
      },
      agreement_state: agreementState,
      current_screen: null,
      provider_evidence: {
        provider: "avantiqo-local",
        model: "instant-conversation-v1",
        usage_id: null,
      },
      navigation: null,
      execution: null,
      operator_catalog: {
        navigation_target_count: 0,
        executable_capability_count: 0,
        bypassed_for_fast_conversation: true,
        instant_response: true,
      },
    };
  }

  const recent = Array.isArray(conversation)
    ? conversation
        .slice(-4)
        .map((item) => ({
          role: item?.role === "assistant" ? "assistant" : "user",
          content: text(item?.content).slice(0, 500),
        }))
        .filter((item) => item.content)
    : [];

  const prompt = `
You are Avantiqo, a natural human-style business assistant in an ongoing spoken conversation.

Respond naturally to this lightweight conversational message without invoking business workflows or capabilities.
Use the same language as the user unless they clearly request another language.
Keep the response concise and spoken-friendly, usually one short sentence.
Do not mention internal systems, routing, capabilities, AI models or implementation details.
Do not output JSON or markdown.

Recent conversation:
${JSON.stringify(recent)}

User: ${text(message)}

Reply only with what Avantiqo should say aloud.
`.trim();

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.text.generate",
    input: {
      prompt,
      max_output_tokens: 80,
    },
    metadata: {
      module: "OPERATOR",
      operation: "FAST_CONVERSATION",
      channel: "voice",
      latency_class: "realtime",
    },
    category: "AI",
  });

  const responseText = findText(execution);
  if (!responseText) {
    throw new Error("OPERATOR_FAST_CONVERSATION_EMPTY_RESPONSE");
  }

  return {
    success: true,
    decision: {
      response_text: responseText.slice(0, 500),
      response_language: text(locale) || null,
      intent: "answer",
      confidence: 1,
      agreement_state: agreementState,
      project_state: projectState,
      clarification: {
        required: false,
        question: null,
        options: [],
      },
      navigation: {
        target_id: null,
      },
      execution: {
        capability_key: null,
        payload: {},
        reason: null,
      },
      plan: [],
    },
    agreement_state: agreementState,
    current_screen: null,
    provider_evidence: {
      provider: execution?.provider || null,
      model: execution?.model || null,
      usage_id: execution?.usage?.id || null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      bypassed_for_fast_conversation: true,
    },
  };
}
