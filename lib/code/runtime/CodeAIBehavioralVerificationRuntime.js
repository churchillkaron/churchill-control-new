import {
  deriveCodeAIRepositoryImpact,
} from "./CodeAIRepositoryImpactRuntime.js";

export const CODE_AI_BEHAVIORAL_VERIFICATION_CONTRACT =
  "AVANTIQO_CODE_AI_BEHAVIORAL_VERIFICATION_V1";

const TEST_PATH_PATTERN =
  /(^|\/)(?:__tests__|tests?|specs?|e2e)(\/|$)|\.(?:test|spec)\.[^/]+$/i;

function text(value, maximum = 2000) {
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

function verificationOperationText(operation = {}) {
  return [
    text(operation?.command, 300),
    ...list(operation?.args).map((item) => text(item, 1200)),
  ].join(" ").trim();
}

function globToRegExp(value) {
  const source = normalizePath(value);
  let pattern = "^";
  for (const character of source) {
    if (character === "*") pattern += ".*";
    else if (character === "?") pattern += ".";
    else pattern += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  pattern += "$";
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function operationTargetsPath(operation, filePath) {
  const target = normalizePath(filePath);
  if (!target) return false;

  const tokens = [
    text(operation?.command, 300),
    ...list(operation?.args).map((item) => text(item, 1200)),
  ]
    .map((item) => normalizePath(item))
    .filter(Boolean);

  for (const token of tokens) {
    if (token === target) return true;
    if (token.includes(target)) return true;
    if (token.includes("*") || token.includes("?")) {
      const matcher = globToRegExp(token);
      if (matcher?.test(target)) return true;
    }
  }
  return false;
}

function broadTestOperation(operation = {}) {
  if (text(operation?.family, 80).toLowerCase() !== "tests") return false;

  const command = text(operation?.command, 300).toLowerCase();
  const args = list(operation?.args).map((item) => text(item, 1200).toLowerCase());
  const joined = `${command} ${args.join(" ")}`.trim();

  if (["npm", "pnpm", "yarn", "bun"].includes(command)) {
    return /(?:^|\s)(?:run\s+)?test(?::[a-z0-9:_-]+)?(?:\s|$)/i.test(joined);
  }
  if (command === "node" && args.includes("--test")) {
    const scopedTestPath = args.some((arg) => TEST_PATH_PATTERN.test(normalizePath(arg)));
    return !scopedTestPath || args.some((arg) => arg.includes("*") || arg.includes("?"));
  }
  if (["pytest", "python", "python3"].includes(command) && /\bpytest\b/.test(joined)) {
    return !args.some((arg) => TEST_PATH_PATTERN.test(normalizePath(arg)));
  }
  if (command === "go" && args[0] === "test") {
    return args.length === 1 || args.includes("./...");
  }
  if (command === "cargo" && args[0] === "test") {
    return !args.includes("--test") && !args.includes("-p") && !args.includes("--package");
  }

  return false;
}

export function assessCodeAIBehavioralVerificationCoverage({
  state = {},
  quality = {},
} = {}) {
  const impact = deriveCodeAIRepositoryImpact(state);
  const changedSourcePaths = unique(impact.current_changed_paths)
    .map(normalizePath)
    .filter((filePath) => filePath && !TEST_PATH_PATTERN.test(filePath));
  const observedTestPaths = unique(impact.likely_test_paths)
    .map(normalizePath)
    .filter(Boolean);
  const freshTestOperations = list(quality?.fresh_verification_operations)
    .filter((operation) => text(operation?.family, 80).toLowerCase() === "tests")
    .map((operation) => ({
      operation_id: text(operation?.operation_id, 200) || null,
      command: text(operation?.command, 300) || null,
      args: list(operation?.args).map((item) => text(item, 1200)).slice(0, 40),
      family: "tests",
    }));

  const required = changedSourcePaths.length > 0 && observedTestPaths.length > 0;
  const broadOperations = freshTestOperations.filter(broadTestOperation);
  const matchedTestPaths = [];
  const matchedOperationIds = [];

  for (const operation of freshTestOperations) {
    for (const testPath of observedTestPaths) {
      if (!operationTargetsPath(operation, testPath)) continue;
      matchedTestPaths.push(testPath);
      if (operation.operation_id) matchedOperationIds.push(operation.operation_id);
    }
  }

  const verified = !required || broadOperations.length > 0 || matchedTestPaths.length > 0;

  return {
    contract: CODE_AI_BEHAVIORAL_VERIFICATION_CONTRACT,
    required,
    verified,
    changed_source_path_count: changedSourcePaths.length,
    changed_source_paths: changedSourcePaths.slice(0, 40),
    observed_impacted_test_count: observedTestPaths.length,
    observed_impacted_test_paths: observedTestPaths.slice(0, 30),
    fresh_test_operation_count: freshTestOperations.length,
    matched_impacted_test_count: unique(matchedTestPaths).length,
    matched_impacted_test_paths: unique(matchedTestPaths).slice(0, 30),
    matched_operation_ids: unique(matchedOperationIds).slice(0, 20),
    broad_test_operation_ids: unique(
      broadOperations.map((operation) => operation.operation_id),
    ).slice(0, 20),
    repository_impact_contract: impact.contract,
    repository_impact_evidence_backed: impact.evidence_backed === true,
    enforcement_basis: required
      ? "OBSERVED_RELATED_TEST_FROM_REPOSITORY_EVIDENCE"
      : "NO_OBSERVED_RELATED_TEST_OBLIGATION",
    model_call_performed: false,
    provider_call_performed: false,
    repository_call_performed: false,
    authorization_effect: "NONE",
  };
}

export const CodeAIBehavioralVerificationRuntime = Object.freeze({
  contract: CODE_AI_BEHAVIORAL_VERIFICATION_CONTRACT,
  assess: assessCodeAIBehavioralVerificationCoverage,
});

export default CodeAIBehavioralVerificationRuntime;
