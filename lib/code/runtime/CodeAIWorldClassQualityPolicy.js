import {
  codeAIEditAction,
  codeAISourceChangePaths,
} from "./CodeAISourceChangePolicy.js";

const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1";

const CRITICAL_PATH_PATTERNS = [
  /(^|\/)(auth|authentication|authorization|security|permissions?|rbac)(\/|$)/i,
  /(^|\/)(billing|payments?|wallet|ledger|accounting)(\/|$)/i,
  /(^|\/)(migrations?|schema)(\/|$)/i,
  /(^|\/)supabase\/migrations(\/|$)/i,
  /(^|\/)\.github\/workflows(\/|$)/i,
  /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|pyproject\.toml|poetry\.lock|go\.mod|go\.sum|cargo\.toml|cargo\.lock)$/i,
];

const HIGH_PATH_PATTERNS = [
  /(^|\/)app\/api(\/|$)/i,
  /(^|\/)lib\/platform(\/|$)/i,
  /(^|\/)(services|workers|server|backend|api)(\/|$)/i,
  /(^|\/)supabase\/functions(\/|$)/i,
  /(^|\/)(infra|infrastructure|terraform|k8s|kubernetes)(\/|$)/i,
];

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map((value) => text(value, 1200)).filter(Boolean))];
}

function sameStringSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function changedPaths(state = {}) {
  return unique([
    ...list(state?.files_changed),
    ...codeAISourceChangePaths(state?.source_changes),
  ]);
}

export function codeAIWorldClassRiskForPaths(paths = []) {
  const normalized = unique(paths);
  if (!normalized.length) return "none";
  if (normalized.some((path) => CRITICAL_PATH_PATTERNS.some((pattern) => pattern.test(path)))) {
    return "critical";
  }
  if (
    normalized.length >= 8 ||
    normalized.some((path) => HIGH_PATH_PATTERNS.some((pattern) => pattern.test(path)))
  ) {
    return "high";
  }
  return "standard";
}

function completedOperationPositions(state = {}) {
  const positions = new Map();
  list(state?.evidence).forEach((entry, index) => {
    if (
      text(entry?.kind, 120) === "operation" &&
      text(entry?.status, 80) === "completed" &&
      text(entry?.operation_id, 200)
    ) {
      positions.set(text(entry.operation_id, 200), {
        index,
        action: text(entry?.action, 80),
      });
    }
  });
  return positions;
}

function lastActionPosition(positions, action) {
  let latest = -1;
  for (const value of positions.values()) {
    if (value.action === action && value.index > latest) latest = value.index;
  }
  return latest;
}

function lastEditPosition(positions) {
  let latest = -1;
  for (const value of positions.values()) {
    if (codeAIEditAction(value.action) && value.index > latest) latest = value.index;
  }
  return latest;
}

function commandSignature(test = {}) {
  const command = text(test?.command, 300).toLowerCase();
  const args = list(test?.args).map((arg) => text(arg, 1200));
  if (!command) return null;
  return JSON.stringify({ command, args });
}

export function codeAIVerificationFamily(test = {}) {
  const command = text(test?.command, 300).toLowerCase();
  const args = list(test?.args).map((arg) => text(arg, 1200).toLowerCase());
  const joined = `${command} ${args.join(" ")}`;
  if (!command) return "unknown";
  if (command === "node" && args.includes("--check")) return "syntax";
  if (command === "python" || command === "python3") {
    if (args.includes("-m") && args.some((arg) => arg === "pytest" || arg === "unittest")) return "tests";
    if (args.includes("-m") && args.includes("compileall")) return "syntax";
  }
  if (command === "pytest") return "tests";
  if (command === "go" && args[0] === "test") return "tests";
  if (command === "cargo" && args[0] === "test") return "tests";
  if (command === "cargo" && args[0] === "check") return "typecheck";
  if (command === "tsc") return "typecheck";
  if (/\b(typecheck|type-check|check-types|tsc)\b/.test(joined)) return "typecheck";
  if (/\b(lint|eslint|biome|ruff|flake8|pylint)\b/.test(joined)) return "lint";
  if (/\b(test|tests|jest|vitest|mocha|ava|tap|playwright|cypress)\b/.test(joined)) return "tests";
  if (/\b(build|compile)\b/.test(joined)) return "build";
  if (/\b(check)\b/.test(joined)) return "check";
  return `command:${command}`;
}

function freshVerificationEvidence(state, positions, lastEdit) {
  const testsByOperation = new Map(
    list(state?.tests)
      .filter((test) => text(test?.operation_id, 200))
      .map((test) => [text(test.operation_id, 200), test]),
  );
  const fresh = [];
  for (const verification of list(state?.verification)) {
    if (verification?.passed !== true) continue;
    const operationId = text(verification?.operation_id, 200);
    const position = positions.get(operationId);
    if (!position || position.action !== "verify" || position.index <= lastEdit) continue;
    const test = testsByOperation.get(operationId) || {};
    fresh.push({
      operation_id: operationId,
      operation_position: position.index,
      command: text(test?.command, 300) || null,
      args: list(test?.args).map((arg) => text(arg, 1200)).slice(0, 40),
      signature: commandSignature(test),
      family: codeAIVerificationFamily(test),
    });
  }
  return fresh;
}

export function requiredCodeAIVerificationGateCount(risk) {
  if (risk === "critical") return 3;
  if (risk === "high") return 2;
  if (risk === "standard") return 1;
  return 0;
}

export function codeAIWorldClassRequiredStatus(blockers = []) {
  if (list(blockers).some((blocker) => text(blocker).includes("DIFF_REVIEW"))) return "review_required";
  return "verification_required";
}

export function assessCodeAIWorldClassQuality(state = {}) {
  const paths = changedPaths(state);
  const risk = codeAIWorldClassRiskForPaths(paths);
  const requiredGates = requiredCodeAIVerificationGateCount(risk);
  const positions = completedOperationPositions(state);
  const lastEdit = lastEditPosition(positions);
  const lastDiffPosition = lastActionPosition(positions, "diff");
  const freshVerification = lastEdit >= 0
    ? freshVerificationEvidence(state, positions, lastEdit)
    : [];
  const distinctFreshSignatures = unique(freshVerification.map((item) => item.signature));
  const distinctFreshFamilies = unique(freshVerification.map((item) => item.family));
  const sourceChangePaths = codeAISourceChangePaths(state?.source_changes);
  const fileChangePaths = unique(list(state?.files_changed));
  const blockers = [];

  if (!paths.length) {
    return {
      contract: CONTRACT,
      verified: true,
      risk: "none",
      changed_file_count: 0,
      changed_paths: [],
      required_verification_gates: 0,
      fresh_verification_gate_count: 0,
      fresh_verification_family_count: 0,
      fresh_verification_families: [],
      fresh_verification_operations: [],
      explicit_final_diff_review: true,
      source_manifest_matches_workspace: true,
      blockers: [],
      required_next_actions: [],
      authorization_effect: "NONE",
    };
  }

  if (lastEdit < 0) blockers.push("CODE_AI_WORLDCLASS_EDIT_EVIDENCE_REQUIRED");
  if (!text(state?.patch, 1)) blockers.push("CODE_AI_WORLDCLASS_PATCH_REQUIRED");
  if (!sameStringSet(sourceChangePaths, fileChangePaths)) {
    blockers.push("CODE_AI_WORLDCLASS_SOURCE_MANIFEST_MISMATCH");
  }
  if (lastEdit >= 0 && lastDiffPosition <= lastEdit) {
    blockers.push("CODE_AI_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED");
  }
  if (
    distinctFreshSignatures.length < requiredGates ||
    distinctFreshFamilies.length < requiredGates
  ) {
    blockers.push(
      `CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED:commands=${distinctFreshSignatures.length}/${requiredGates}:families=${distinctFreshFamilies.length}/${requiredGates}`,
    );
  }

  const requiredNextActions = [];
  if (blockers.some((blocker) => blocker.includes("DIFF_REVIEW"))) requiredNextActions.push("diff");
  if (blockers.some((blocker) => blocker.includes("VERIFICATION_GATES"))) requiredNextActions.push("verify");

  return {
    contract: CONTRACT,
    verified: blockers.length === 0,
    risk,
    changed_file_count: paths.length,
    changed_paths: paths.slice(0, 80),
    required_verification_gates: requiredGates,
    fresh_verification_gate_count: distinctFreshSignatures.length,
    fresh_verification_family_count: distinctFreshFamilies.length,
    fresh_verification_families: distinctFreshFamilies,
    fresh_verification_operations: freshVerification.map((item) => ({
      operation_id: item.operation_id,
      command: item.command,
      args: item.args,
      family: item.family,
    })),
    explicit_final_diff_review: lastEdit >= 0 && lastDiffPosition > lastEdit,
    source_manifest_matches_workspace: sameStringSet(sourceChangePaths, fileChangePaths),
    last_edit_operation_position: lastEdit,
    last_diff_operation_position: lastDiffPosition,
    blockers,
    required_next_actions: requiredNextActions,
    authorization_effect: "NONE",
  };
}

export const CodeAIWorldClassQualityPolicy = Object.freeze({
  contract: CONTRACT,
  assess: assessCodeAIWorldClassQuality,
  riskForPaths: codeAIWorldClassRiskForPaths,
  verificationFamily: codeAIVerificationFamily,
  requiredVerificationGateCount: requiredCodeAIVerificationGateCount,
  requiredStatus: codeAIWorldClassRequiredStatus,
});
