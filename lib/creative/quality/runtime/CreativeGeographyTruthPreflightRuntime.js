function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

const GENERIC_ONLY = new Set([
  "water", "sea", "ocean", "beach", "skyline", "city", "office", "street",
  "building", "buildings", "palm trees", "mountains", "forest", "road", "hotel",
]);

const GENERIC_CLAIM_TOKENS = new Set([
  "city", "street", "road", "avenue", "beach", "ocean", "water", "office",
  "skyline", "district", "hotel", "building", "island", "north", "south", "east", "west",
]);

function claimTokens(value) {
  return text(value).toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !GENERIC_CLAIM_TOKENS.has(token));
}

export function creativeGeographyTruthFailures(shot = {}) {
  const claim = text(shot.geography_claim);
  if (!claim || claim.toUpperCase() === "NONE") return [];
  const signature = object(shot.geography_signature);
  const anchors = list(signature.recognition_anchors).map(text).filter(Boolean);
  const forbidden = list(signature.forbidden_generic_substitutes).map(text).filter(Boolean);
  const recognitionTest = text(signature.recognition_test);
  const failures = [];
  if (anchors.length < 2) failures.push("SHOT_GEOGRAPHY_RECOGNITION_ANCHORS_REQUIRED");
  if (!forbidden.length) failures.push("SHOT_GEOGRAPHY_GENERIC_SUBSTITUTES_REQUIRED");
  if (recognitionTest.length < 25) failures.push("SHOT_GEOGRAPHY_RECOGNITION_TEST_REQUIRED");
  if (anchors.some((anchor) => GENERIC_ONLY.has(anchor.toLowerCase()))) {
    failures.push("SHOT_GEOGRAPHY_GENERIC_ANCHOR_FORBIDDEN");
  }
  const tokens = claimTokens(claim);
  if (tokens.length && !anchors.some((anchor) => {
    const normalized = anchor.toLowerCase();
    return tokens.some((token) => normalized.includes(token));
  })) {
    failures.push("SHOT_GEOGRAPHY_CLAIM_NOT_BOUND_TO_VISIBLE_ANCHOR");
  }
  return [...new Set(failures)];
}

export const CreativeGeographyTruthPreflightRuntime = Object.freeze({
  contract: "CREATIVE_GEOGRAPHY_TRUTH_PREFLIGHT_V1",
  evaluate(shot = {}) {
    const failures = creativeGeographyTruthFailures(shot);
    return {
      contract: this.contract,
      passed: failures.length === 0,
      failures,
      zero_provider_calls: true,
      zero_media_generation: true,
    };
  },
});
