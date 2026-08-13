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

function parseJson(value) {
  const source = text(value);
  if (!source) return null;

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? source.slice(firstBrace, lastBrace + 1)
      : source;

  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
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

  const instructions = `
You are Avantiqo speaking naturally to a business user who has just called your wake name.

Generate only a brief human acknowledgement that signals you are present and ready to hear the user's request.

Requirements:
- Sound like a calm, capable human assistant, not a device status message.
- Use the user's language from the supplied locale.
- Keep it conversational and very short: normally 1 to 5 words.
- Do not repeat the previous acknowledgement if one is supplied.
- Do not mention systems, AI, listening mode, wake words, buttons, microphones or implementation details.
- Do not claim you completed an action.
- Do not ask a substantive business question yet.
- Return strict JSON only.

Return:
{
  "acknowledgement": "natural spoken acknowledgement",
  "language": "BCP-47 language tag or null"
}
`;

  const request = {
    task: "Return the natural Avantiqo wake acknowledgement as a valid JSON object.",
    json_response_contract: {
      acknowledgement: "short natural spoken acknowledgement",
      language: "BCP-47 language tag or null",
    },
    locale: text(locale) || null,
    organization_name: text(organizationName) || null,
    previous_acknowledgement: text(previousAcknowledgement) || null,
  };

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.reasoning.execute",
    input: {
      input: JSON.stringify(request),
      instructions_text: instructions,
      max_output_tokens: 80,
      response_format: {
        type: "json_object",
      },
    },
    metadata: {
      module: "OPERATOR",
      operation: "VOICE_ACKNOWLEDGEMENT",
      channel: "voice",
    },
    category: "AI",
  });

  const parsed = parseJson(findText(execution));
  const acknowledgement = text(parsed?.acknowledgement);

  if (!acknowledgement) {
    throw new Error("OPERATOR_VOICE_ACKNOWLEDGEMENT_INVALID_RESPONSE");
  }

  return {
    acknowledgement: acknowledgement.slice(0, 80),
    language: text(parsed?.language) || text(locale) || null,
    provider_evidence: {
      provider: execution?.provider || null,
      model: execution?.model || null,
      usage_id: execution?.usage?.id || null,
    },
  };
}
