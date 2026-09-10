function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function needsResearchTruth(shot = {}) {
  return text(object(shot.hero_asset_truth).mode).toUpperCase() === "REFERENCE_GROUNDED_CLASS";
}

export function creativeTechnicalSubjectTruthFailures(shot = {}) {
  if (!needsResearchTruth(shot)) return [];
  const evidence = object(shot.technical_truth_evidence);
  const sources = list(evidence.sources);
  const facts = list(evidence.validated_facts).map(text).filter(Boolean);
  const confusions = list(evidence.prohibited_confusions).map(text).filter(Boolean);
  const failures = [];

  if (sources.length < 2) failures.push("SHOT_TECHNICAL_TRUTH_MINIMUM_SOURCES_REQUIRED");
  if (facts.length < 3) failures.push("SHOT_TECHNICAL_TRUTH_VALIDATED_FACTS_REQUIRED");
  if (confusions.length < 2) failures.push("SHOT_TECHNICAL_TRUTH_PROHIBITED_CONFUSIONS_REQUIRED");
  if (sources.some((source) => !text(source?.uri || source?.url || source?.source_id) || !text(source?.claim))) {
    failures.push("SHOT_TECHNICAL_TRUTH_SOURCE_CLAIM_REQUIRED");
  }
  return [...new Set(failures)];
}
export const CreativeTechnicalSubjectTruthRuntime = Object.freeze({
  contract: "CREATIVE_TECHNICAL_SUBJECT_TRUTH_V1",
  evaluate(shot = {}) {
    const failures = creativeTechnicalSubjectTruthFailures(shot);
    return {
      contract: this.contract,
      passed: failures.length === 0,
      failures,
      zero_provider_calls: true,
      zero_media_generation: true,
    };
  },
});
