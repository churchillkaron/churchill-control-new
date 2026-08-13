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
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }

  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }

  return "";
}

function cleanAcknowledgement(value) {
  return text(value)
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^['\"]|['\"]$/g, "")
    .replace(/^[\-–—]\s*/, "")
    .trim();
}

export async function generateOperatorVoiceAcknowledgement({
  organizationId,
  partyId,
  entityId = null,
  locale = null,
  organizationName = null,
  previousAcknowledgement = null,
} = {}) {
  if (!organizationId) throw new Error("OPERATOR_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("OPERATOR_PARTY_REQUIRED");

  const prompt = `
You are Avantiqo, a natural human-style business assistant.
The user has just called your wake name and has not asked the business question yet.

Reply with one very short natural acknowledgement only.
Use the language implied by locale: ${text(locale) || "the user's current language"}.
Organization context: ${text(organizationName) || "current organization"}.
Previous acknowledgement to avoid repeating: ${text(previousAcknowledgement) || "none"}.

Rules:
- 1 to 5 words normally.
- Calm, capable and conversational.
- No JSON.
- No quotation marks.
- No explanation.
- Do not mention AI, systems, microphones, listening mode or wake words.
- Do not claim an action was completed.
- Do not ask the substantive business question yourself.

Return only the words Avantiqo should speak.
`.trim();

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.text.generate",
    input: {
      prompt,
      max_output_tokens: 24,
    },
    metadata: {
      module: "OPERATOR",
      operation: "VOICE_ACKNOWLEDGEMENT",
      channel: "voice",
      latency_class: "interactive",
    },
    category: "AI",
  });

  const acknowledgement = cleanAcknowledgement(findText(execution));

  if (!acknowledgement) {
    throw new Error("OPERATOR_VOICE_ACKNOWLEDGEMENT_INVALID_RESPONSE");
  }

  return {
    acknowledgement: acknowledgement.slice(0, 80),
    language: text(locale) || null,
    provider_evidence: {
      provider: execution?.provider || null,
      model: execution?.model || null,
      usage_id: execution?.usage?.id || null,
    },
  };
}
