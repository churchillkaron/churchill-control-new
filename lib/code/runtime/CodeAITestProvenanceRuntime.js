import {
  assessCodeAIBehavioralVerificationCoverage,
} from "./CodeAIBehavioralVerificationRuntime.js";

export const CODE_AI_TEST_PROVENANCE_CONTRACT =
  "AVANTIQO_CODE_AI_TEST_PROVENANCE_V1";

const TEST_PATH_PATTERN =
  /(^|\/)(?:__tests__|tests?|specs?|e2e)(\/|$)|\.(?:test|spec)\.[^/]+$/i;

function text(value, maximum = 1600) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map((item) => text(item, 1200)).filter(Boolean))];
}

function normalizePath(value) {
  return text(value, 1200)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/");
}

function normalizedRisk(value) {
  const risk = text(value, 80).toLowerCase();
  return ["critical", "high", "standard", "none"].includes(risk)
    ? risk
    : "none";
}

function changedPaths(state = {}) {
  return unique([
    ...list(state?.files_changed),
    ...list(state?.source_changes).map((item) => item?.path),
  ]).map(normalizePath).filter(Boolean);
}

export function assessCodeAITestProvenance({
  state = {},
  quality = {},
  behavioral_verification = null,
} = {}) {
  const risk = normalizedRisk(quality?.risk);
  const changed = changedPaths(state);
  const changedTestPaths = changed.filter((filePath) => TEST_PATH_PATTERN.test(filePath));
  const changedSourcePaths = changed.filter((filePath) => !TEST_PATH_PATTERN.test(filePath));
  const behavioral = behavioral_verification || assessCodeAIBehavioralVerificationCoverage({
    state,
    quality,
  });
  const matchedImpactedTestPaths = unique(behavioral?.matched_impacted_test_paths)
    .map(normalizePath)
    .filter(Boolean);
  const changedTestSet = new Set(changedTestPaths);
  const unchangedMatchedImpactedTestPaths = matchedImpactedTestPaths
    .filter((filePath) => !changedTestSet.has(filePath));
  const broadTestOperationIds = unique(behavioral?.broad_test_operation_ids);

  const required =
    ["high", "critical"].includes(risk) &&
    changedSourcePaths.length > 0 &&
    changedTestPaths.length > 0 &&
    behavioral?.required === true;
  const verified =
    !required ||
    broadTestOperationIds.length > 0 ||
    unchangedMatchedImpactedTestPaths.length > 0;

  return {
    contract: CODE_AI_TEST_PROVENANCE_CONTRACT,
    required,
    verified,
    risk,
    changed_source_path_count: changedSourcePaths.length,
    changed_source_paths: changedSourcePaths.slice(0, 40),
    changed_test_path_count: changedTestPaths.length,
    changed_test_paths: changedTestPaths.slice(0, 30),
    behavioral_verification_required: behavioral?.required === true,
    behavioral_verification_verified: behavioral?.verified === true,
    matched_impacted_test_count: matchedImpactedTestPaths.length,
    matched_impacted_test_paths: matchedImpactedTestPaths.slice(0, 30),
    unchanged_matched_impacted_test_count: unchangedMatchedImpactedTestPaths.length,
    unchanged_matched_impacted_test_paths: unchangedMatchedImpactedTestPaths.slice(0, 30),
    broad_test_operation_count: broadTestOperationIds.length,
    broad_test_operation_ids: broadTestOperationIds.slice(0, 20),
    trust_basis: !required
      ? "NOT_REQUIRED"
      : broadTestOperationIds.length > 0
        ? "BROAD_SUITE"
        : unchangedMatchedImpactedTestPaths.length > 0
          ? "UNCHANGED_OBSERVED_RELATED_TEST"
          : "ONLY_MISSION_MODIFIED_TEST_PROOF",
    test_changes_can_self_certify_high_risk_behavior: false,
    model_call_performed: false,
    provider_call_performed: false,
    repository_call_performed: false,
    authorization_effect: "NONE",
  };
}

export const CodeAITestProvenanceRuntime = Object.freeze({
  contract: CODE_AI_TEST_PROVENANCE_CONTRACT,
  assess: assessCodeAITestProvenance,
});

export default CodeAITestProvenanceRuntime;
