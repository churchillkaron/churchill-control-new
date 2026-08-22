const OWNED_INTELLIGENCE_PROVIDER = "avantiqo-intelligence";
const CONTRACT = "AVANTIQO_OPERATOR_COGNITION_PROVENANCE_V1";

function text(value, limit = 400) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function recordOperatorCognitionProvenance({
  organizationId,
  source = "text",
  result = {},
  cognitiveBriefUsed = false,
} = {}) {
  const evidence = object(result.provider_evidence);
  const provider = text(evidence.provider, 120) || null;
  const owned = provider === OWNED_INTELLIGENCE_PROVIDER;
  const externalFallback = Boolean(provider && !owned && provider !== "avantiqo-local");

  const record = {
    contract: CONTRACT,
    organization_id: text(organizationId, 160) || null,
    source: text(source, 40) || "text",
    owned_intelligence_selected: owned,
    external_cognition_selected: externalFallback,
    local_deterministic_path: provider === "avantiqo-local",
    cognitive_brief_used: cognitiveBriefUsed === true,
    usage_id: text(evidence.usage_id, 160) || null,
    recorded_at: new Date().toISOString(),
  };

  console.info("AVANTIQO_OPERATOR_COGNITION_PROVENANCE", JSON.stringify(record));
  return record;
}

export const OperatorIntelligenceProvenanceRuntime = Object.freeze({
  contract: CONTRACT,
  record: recordOperatorCognitionProvenance,
});
