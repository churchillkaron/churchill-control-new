function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

const MODES = new Set([
  "SOURCE_LOCKED_EXACT",
  "REFERENCE_GROUNDED_CLASS",
  "ORIGINAL_SYNTHETIC",
  "NOT_APPLICABLE",
]);

export function creativeHeroAssetTruthFailures(shot = {}) {
  const truth = object(shot.hero_asset_truth);
  const mode = text(truth.mode).toUpperCase();
  const references = list(truth.reference_asset_ids).map(text).filter(Boolean);
  const limitations = list(truth.limitations).map(text).filter(Boolean);
  const failures = [];

  if (!MODES.has(mode)) failures.push("SHOT_HERO_ASSET_TRUTH_MODE_REQUIRED");
  if (mode === "SOURCE_LOCKED_EXACT" && !references.length) {
    failures.push("SHOT_HERO_ASSET_EXACT_REFERENCE_REQUIRED");
  }
  if (truth.exact_geometry_claimed === true && mode !== "SOURCE_LOCKED_EXACT") {
    failures.push("SHOT_HERO_ASSET_EXACT_GEOMETRY_CLAIM_FORBIDDEN");
  }
  if (mode === "REFERENCE_GROUNDED_CLASS" && !limitations.length) {
    failures.push("SHOT_HERO_ASSET_REFERENCE_LIMITATIONS_REQUIRED");
  }
  return [...new Set(failures)];
}
export const CreativeHeroAssetTruthRuntime = Object.freeze({
  contract: "CREATIVE_HERO_ASSET_TRUTH_V1",
  modes: [...MODES],
  evaluate(shot = {}) {
    const failures = creativeHeroAssetTruthFailures(shot);
    return {
      contract: this.contract,
      passed: failures.length === 0,
      failures,
      zero_provider_calls: true,
      zero_media_generation: true,
    };
  },
});
