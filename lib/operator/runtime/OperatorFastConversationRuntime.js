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

export function isFastConversationTurn({ message, source } = {}) {
  if (text(source).toLowerCase() !== "voice") return false;

  const clean = text(message);
  if (!clean || clean.length > 80) return false;

  return CASUAL_PATTERNS.some((pattern) => pattern.test(clean));
}

export async function runFastConversationTurn({
  organizationId,
  partyId,
  entityId = null,
  locale = null,
  message,
  conversation = [],
} = {}) {
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
      agreement_state: {},
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
    agreement_state: {},
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
