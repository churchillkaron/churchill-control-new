import { evaluateVirtualProductionWorkstream } from "./CreativeVirtualProductionWorkstreamRuntime.js";

export const CREATIVE_RESEARCH_ROOM_ADAPTER_CONTRACT = "CREATIVE_RESEARCH_ROOM_ADAPTER_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function nonempty(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value;
    if (value && typeof value === "object" && Object.keys(value).length) return value;
    if (String(value ?? "").trim()) return value;
  }
  return null;
}

export function buildResearchRoomReport({ research = {}, universal_asset_intelligence = {}, brief = {} } = {}) {
  const metadata = object(research.metadata);
  const validation = object(metadata.validation || research.validation);
  const direction = object(brief.metadata?.autonomous_research);
  const sources = list(direction.sources || metadata.sources).map((source) => ({
    source_id: source.id || source.source_id || source.url,
    claim: source.claim || source.title || source.publisher || source.url,
    url: source.url || null,
  }));
  const evidence = {
    source_manifest: sources,
    location_findings: nonempty(universal_asset_intelligence.location_profiles, direction.company_truth?.locations, metadata.location_intelligence),
    cultural_findings: nonempty(direction.audience, direction.brand_intelligence, metadata.cultural_intelligence),
    technical_findings: nonempty(universal_asset_intelligence.product_profiles, direction.claims, metadata.technical_intelligence),
    weather_daylight_findings: nonempty(metadata.weather_daylight, direction.weather_daylight, brief.metadata?.weather_daylight),
    open_questions: nonempty(validation.open_questions, metadata.open_questions, ["No unresolved production-critical research questions declared."]),
  };
  const workstream = evaluateVirtualProductionWorkstream({ requirement: 1, evidence });
  const failures = [...workstream.failures];
  if (validation.passed !== true) failures.push("RESEARCH_ROOM_SOURCE_RESEARCH_VALIDATION_REQUIRED");
  return Object.freeze({
    contract: CREATIVE_RESEARCH_ROOM_ADAPTER_CONTRACT,
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    workstream_report: Object.freeze({ ...workstream, passed: failures.length === 0 }),
    evidence,
    research_identity: direction.research_identity || metadata.research_identity || null,
    zero_media_generation: true,
  });
}

export const CreativeResearchRoomAdapterRuntime = Object.freeze({
  contract: CREATIVE_RESEARCH_ROOM_ADAPTER_CONTRACT,
  build: buildResearchRoomReport,
});