export const AVANTIQO_RESEARCH_EVIDENCE_PAYLOAD_CONTRACT =
  "AVANTIQO_RESEARCH_EVIDENCE_PAYLOAD_V1";

const OPERATOR_READ_BRIDGE_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_READ_TOOL_BRIDGE_V1";
const RESEARCH_CAPABILITY_KEYS = new Set([
  "platform.research.search",
  "platform.research_source.read",
  "platform.research_compare.analyze",
]);

function text(value, limit = 300) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function resolveAvantiqoResearchEvidencePayload(result = {}) {
  const envelope = object(result);
  if (envelope.ok !== true) return null;

  const toolPayload = object(envelope.result);
  if (!Object.keys(toolPayload).length) return null;

  const isCanonicalResearchBridgeResult =
    text(toolPayload.contract, 180) === OPERATOR_READ_BRIDGE_CONTRACT &&
    text(toolPayload.status, 80).toLowerCase() === "completed" &&
    RESEARCH_CAPABILITY_KEYS.has(text(toolPayload.capability_key, 300));

  if (!isCanonicalResearchBridgeResult) {
    return toolPayload;
  }

  const nested = object(toolPayload.result);
  return Object.keys(nested).length ? nested : null;
}

export const AvantiqoResearchEvidencePayloadRuntime = Object.freeze({
  contract: AVANTIQO_RESEARCH_EVIDENCE_PAYLOAD_CONTRACT,
  resolve: resolveAvantiqoResearchEvidencePayload,
  governance: Object.freeze({
    operator_bridge_contract: OPERATOR_READ_BRIDGE_CONTRACT,
    exact_research_capability_match_required: true,
    arbitrary_nested_result_unwrap_allowed: false,
    authorization_effect: "NONE",
    raw_result_persisted: false,
  }),
});
