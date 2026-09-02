const CONTRACT = "AVANTIQO_INTELLIGENCE_OUTPUT_ENVELOPE_V1";
const NESTED_KEYS = Object.freeze(["output", "raw", "result", "data", "response"]);
const MAX_DEPTH = 8;

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

function hasUsableModelOutput(value) {
  const candidate = object(value);
  return Boolean(
    text(candidate.text) ||
    list(candidate.tool_calls).length > 0
  );
}

export function resolveIntelligenceSettledOutputEnvelope(execution = {}) {
  let current = object(execution?.output);
  const seen = new Set();

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (!Object.keys(current).length) return {};
    if (hasUsableModelOutput(current)) return current;
    if (seen.has(current)) return current;
    seen.add(current);

    const next = NESTED_KEYS
      .map((key) => object(current[key]))
      .find((candidate) => Object.keys(candidate).length > 0);

    if (!next) return current;
    current = next;
  }

  return current;
}

export const AvantiqoIntelligenceOutputEnvelopeRuntime = Object.freeze({
  contract: CONTRACT,
  nestedKeys: NESTED_KEYS,
  maxDepth: MAX_DEPTH,
  resolve: resolveIntelligenceSettledOutputEnvelope,
});

export default AvantiqoIntelligenceOutputEnvelopeRuntime;
