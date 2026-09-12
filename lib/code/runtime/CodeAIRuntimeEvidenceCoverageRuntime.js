export const CODE_AI_RUNTIME_EVIDENCE_COVERAGE_CONTRACT =
  "AVANTIQO_CODE_AI_RUNTIME_EVIDENCE_COVERAGE_V1";

const UI_PATH = /(^|\/)(?:app(?!\/api)|components?|pages?|views?|screens?|ui)(\/|$)|\.(?:jsx|tsx)$/i;
const API_PATH = /(^|\/)(?:app\/api|api|routes?|controllers?|handlers?|rpc)(\/|$)/i;
const E2E_PATH = /(^|\/)(?:e2e|playwright|cypress)(\/|$)|\.(?:e2e|browser)\.(?:js|jsx|ts|tsx|mjs|cjs)$/i;

function text(value, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.map((item) => text(item, 1200)).filter(Boolean))];
}

function changedPaths(state = {}) {
  return unique([
    ...list(state?.files_changed),
    ...list(state?.source_changes).map((entry) => entry?.path),
  ]);
}

function evidenceItems(state = {}) {
  const context = object(state?.objective_context);
  return [
    ...list(state?.runtime_evidence),
    ...list(context.runtime_evidence),
    ...list(context.browser_evidence),
    ...list(context.trace_evidence),
    ...list(context.metric_evidence),
  ].filter(Boolean).slice(-60);
}

function evidenceKind(entry) {
  if (typeof entry === "string") return "runtime";
  const source = object(entry);
  return text(source.kind || source.type || source.source, 120).toLowerCase() || "runtime";
}

function matchedBehavioralTests(behavioral = {}) {
  return unique(list(behavioral?.matched_impacted_test_paths));
}

function browserEvidence(items) {
  return items.filter((entry) => {
    const kind = evidenceKind(entry);
    return /browser|playwright|cypress|visual|preview|hydration|console/.test(kind);
  });
}

function apiRuntimeEvidence(items) {
  return items.filter((entry) => {
    const kind = evidenceKind(entry);
    return /api|http|request|response|integration|runtime|trace|replay/.test(kind);
  });
}

export function assessCodeAIRuntimeEvidenceCoverage({
  state = {},
  quality = {},
  behavioral_verification = null,
} = {}) {
  const paths = changedPaths(state);
  const risk = text(quality?.risk, 80).toLowerCase();
  const highRisk = ["high", "critical"].includes(risk);
  const uiPaths = paths.filter((path) => UI_PATH.test(path) && !API_PATH.test(path));
  const apiPaths = paths.filter((path) => API_PATH.test(path));
  const behavior = object(behavioral_verification);
  const matchedTests = matchedBehavioralTests(behavior);
  const e2eTests = matchedTests.filter((path) => E2E_PATH.test(path));
  const items = evidenceItems(state);
  const browsers = browserEvidence(items);
  const apiRuntime = apiRuntimeEvidence(items);
  const uiRequired = highRisk && uiPaths.length > 0;
  const apiRequired = highRisk && apiPaths.length > 0;
  const uiVerified = !uiRequired || browsers.length > 0 || e2eTests.length > 0;
  const apiVerified =
    !apiRequired ||
    apiRuntime.length > 0 ||
    (behavior?.verified === true && matchedTests.length > 0);
  const required = uiRequired || apiRequired;
  const verified = uiVerified && apiVerified;
  const missing = [];
  if (!uiVerified) missing.push("UI_BROWSER_OR_E2E_RUNTIME_EVIDENCE");
  if (!apiVerified) missing.push("API_RUNTIME_OR_TARGETED_INTEGRATION_EVIDENCE");

  return {
    contract: CODE_AI_RUNTIME_EVIDENCE_COVERAGE_CONTRACT,
    required,
    verified,
    risk,
    changed_ui_paths: uiPaths.slice(0, 40),
    changed_api_paths: apiPaths.slice(0, 40),
    explicit_runtime_evidence_count: items.length,
    browser_evidence_count: browsers.length,
    api_runtime_evidence_count: apiRuntime.length,
    matched_impacted_test_count: matchedTests.length,
    matched_e2e_test_count: e2eTests.length,
    missing_evidence: missing,
    standard_risk_runtime_evidence_recommended:
      risk === "standard" && (uiPaths.length > 0 || apiPaths.length > 0),
    unit_tests_alone_do_not_certify_high_risk_ui: true,
    generic_unrelated_tests_do_not_certify_high_risk_api: true,
    authorization_effect: "NONE",
    commit_authority: false,
    deploy_authority: false,
  };
}

export const CodeAIRuntimeEvidenceCoverageRuntime = Object.freeze({
  contract: CODE_AI_RUNTIME_EVIDENCE_COVERAGE_CONTRACT,
  assess: assessCodeAIRuntimeEvidenceCoverage,
});

export default CodeAIRuntimeEvidenceCoverageRuntime;
