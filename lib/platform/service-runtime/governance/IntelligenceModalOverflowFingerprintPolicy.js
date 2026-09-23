import { createHash } from "node:crypto";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((out, key) => {
      const item = value[key];
      if (item !== undefined) out[key] = canonical(item);
      return out;
    }, {});
  }
  return value;
}

export function intelligenceModalOverflowRequestFingerprint(input = {}, lane = null) {
  const source = object(input);
  const explicitIdentity = object(
    source.modal_overflow_request_identity ||
      source.modalOverflowRequestIdentity ||
      source.metadata?.modal_overflow_request_identity,
  );
  const fingerprintInput = Object.keys(explicitIdentity).length
    ? canonical({
        contract: "AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_REQUEST_FINGERPRINT_V1",
        identity_contract: "EXPLICIT_SERVER_REQUEST_IDENTITY",
        capability: text(source.capability, 200) || null,
        lane: text(lane || source.execution_lane || source.executionLane, 40).toLowerCase() || null,
        model: text(source.model, 240) || null,
        request_identity: explicitIdentity,
        response_format: source.response_format ?? source.responseFormat ?? null,
        max_output_tokens: Number(source.max_output_tokens || source.maxOutputTokens || 0),
        tools: Array.isArray(source.tools) ? source.tools : [],
        tool_choice: source.tool_choice ?? source.toolChoice ?? null,
      })
    : canonical({
        contract: "AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_REQUEST_FINGERPRINT_V1",
        identity_contract: "FULL_PROVIDER_REQUEST",
        capability: text(source.capability, 200) || null,
        lane: text(lane || source.execution_lane || source.executionLane, 40).toLowerCase() || null,
        model: text(source.model, 240) || null,
        messages: Array.isArray(source.messages) ? source.messages : null,
        prompt: source.prompt ?? null,
        input: source.input ?? null,
        text: source.text ?? null,
        instructions_text: source.instructions_text ?? source.instructionsText ?? null,
        response_format: source.response_format ?? source.responseFormat ?? null,
        max_output_tokens: Number(source.max_output_tokens || source.maxOutputTokens || 0),
        tools: Array.isArray(source.tools) ? source.tools : [],
        tool_choice: source.tool_choice ?? source.toolChoice ?? null,
        temperature: Number.isFinite(Number(source.temperature)) ? Number(source.temperature) : null,
      });
  return createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex");
}
