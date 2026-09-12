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
function researchField(research = {}, metadata = {}, key) {
  return nonempty(research?.[key], metadata?.[key]);
}
function locationNeutralDaylightFinding({ research = {}, metadata = {}, direction = {} } = {}) {
  const grounding = object(researchField(research, metadata, "creative_grounding"));
  const constraints = [
    ...list(grounding.continuity_constraints),
    ...list(direction.continuity_constraints),
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const explicitlyLocationNeutral = constraints.some((value) =>
    /without (showing )?specific locations|avoid (all )?specific location|no specific location|location[- ]independent/i.test(value),
  );
  if (!explicitlyLocationNeutral) return null;
  return Object.freeze({
    status: "DEFERRED_UNTIL_LOCATION_SELECTION",
    basis: "The validated research explicitly keeps the concept location-neutral at Research Room stage; weather/daylight becomes binding only after a production location is selected.",
    continuity_constraints: constraints,
  });
}

export function buildResearchRoomReport({ research = {}, universal_asset_intelligence = {}, brief = {} } = {}) {
  const metadata = object(research.metadata);
  const validation = object(research.validation || metadata.validation);
  const direction = object(brief.metadata?.autonomous_research);
  const sources = list(
    nonempty(direction.sources, research.sources, metadata.sources),
  ).map((source) => ({
    source_id: source.id || source.source_id || source.url,
    claim: source.claim || source.title || source.publisher || source.url,
    url: source.url || null,
  }));
  const strategicSynthesis = object(researchField(research, metadata, "strategic_synthesis"));
  const grounding = object(researchField(research, metadata, "creative_grounding"));
  const evidence = {
    source_manifest: sources,
    location_findings: nonempty(
      universal_asset_intelligence.location_profiles,
      direction.company_truth?.locations,
      research.company_resolution,
      metadata.company_resolution,
      grounding.spatial_path,
      metadata.location_intelligence,
    ),
    cultural_findings: nonempty(
      direction.audience,
      direction.brand_intelligence,
      research.audience,
      metadata.audience,
      strategicSynthesis.cultural_context,
      research.brand_intelligence,
      metadata.brand_intelligence,
      metadata.cultural_intelligence,
    ),
    technical_findings: nonempty(
      universal_asset_intelligence.product_profiles,
      direction.claims,
      research.claims,
      metadata.claims,
      research.company_truth,
      metadata.company_truth,
      metadata.technical_intelligence,
    ),
    weather_daylight_findings: nonempty(
      metadata.weather_daylight,
      research.weather_daylight,
      direction.weather_daylight,
      brief.metadata?.weather_daylight,
      locationNeutralDaylightFinding({ research, metadata, direction }),
    ),
    open_questions: nonempty(
      validation.open_questions,
      research.open_questions,
      metadata.open_questions,
      ["No unresolved production-critical research questions declared."],
    ),
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
    reference_candidates: list(grounding.reference_candidates),
    research_identity: direction.research_identity || research.research_identity || metadata.research_identity || null,
    zero_media_generation: true,
  });
}

export const CreativeResearchRoomAdapterRuntime = Object.freeze({
  contract: CREATIVE_RESEARCH_ROOM_ADAPTER_CONTRACT,
  build: buildResearchRoomReport,
});