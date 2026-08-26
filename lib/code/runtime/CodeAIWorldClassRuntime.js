import { executeAutonomousCodeMission } from "./CodeAIAutonomousRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1";
const MAX_EVIDENCE_ITEMS = 120;
const MAX_QUALITY_CONVERGENCE_PASSES = 4;

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

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function now() {
  return new Date().toISOString();
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
    ...list(state?.source_changes).map((change) => change?.path),
  ]);
}

function riskForPaths(paths) {
  if (!paths.length) return "none";
  if (paths.some((path) => CRITICAL_PATH_PATTERNS.some((pattern) => pattern.test(path)))) {
    return "critical";
  }
  if (
    paths.length >= 8 ||
    paths.some((path) => HIGH_PATH_PATTERNS.some((pattern) => pattern.test(path)))
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

function commandSignature(test = {}) {
  const command = text(test?.command, 300).toLowerCase();
  const args = list(test?.args).map((arg) => text(arg, 1200));
  if (!command) return null;
  return JSON.stringify({ command, args });
}

function verificationFamily(test = {}) {
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

function freshVerificationEvidence(state, positions, lastEditPosition) {
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
    if (!position || position.action !== "verify" || position.index <= lastEditPosition) continue;
    const test = testsByOperation.get(operationId) || {};
    fresh.push({
      operation_id: operationId,
      operation_position: position.index,
      command: text(test?.command, 300) || null,
      args: list(test?.args).map((arg) => text(arg, 1200)).slice(0, 40),
      signature: commandSignature(test),
      family: verificationFamily(test),
    });
  }
  return fresh;
}

function requiredVerificationGateCount(risk) {
  if (risk === "critical") return 3;
  if (risk === "high") return 2;
  if (risk === "standard") return 1;
  return 0;
}

function requiredStatus(blockers) {
  if (blockers.some((blocker) => blocker.includes("DIFF_REVIEW"))) return "review_required";
  return "verification_required";
}

export function assessCodeAIWorldClassQuality(state = {}) {
  const source = object(state);
  const paths = changedPaths(source);
  const risk = riskForPaths(paths);
  const requiredGates = requiredVerificationGateCount(risk);
  const positions = completedOperationPositions(source);
  const lastEditPosition = lastActionPosition(positions, "apply_files");
  const lastDiffPosition = lastActionPosition(positions, "diff");
  const freshVerification = lastEditPosition >= 0
    ? freshVerificationEvidence(source, positions, lastEditPosition)
    : [];
  const distinctFreshSignatures = unique(
    freshVerification.map((item) => item.signature),
  );
  const distinctFreshFamilies = unique(
    freshVerification.map((item) => item.family),
  );
  const sourceChangePaths = unique(list(source?.source_changes).map((change) => change?.path));
  const fileChangePaths = unique(list(source?.files_changed));
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

  if (lastEditPosition < 0) {
    blockers.push("CODE_AI_WORLDCLASS_EDIT_EVIDENCE_REQUIRED");
  }
  if (!text(source?.patch, 1)) {
    blockers.push("CODE_AI_WORLDCLASS_PATCH_REQUIRED");
  }
  if (!sameStringSet(sourceChangePaths, fileChangePaths)) {
    blockers.push("CODE_AI_WORLDCLASS_SOURCE_MANIFEST_MISMATCH");
  }
  if (lastEditPosition >= 0 && lastDiffPosition <= lastEditPosition) {
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
  if (blockers.some((blocker) => blocker.includes("DIFF_REVIEW"))) {
    requiredNextActions.push("diff");
  }
  if (blockers.some((blocker) => blocker.includes("VERIFICATION_GATES"))) {
    requiredNextActions.push("verify");
  }

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
    explicit_final_diff_review: lastEditPosition >= 0 && lastDiffPosition > lastEditPosition,
    source_manifest_matches_workspace: sameStringSet(sourceChangePaths, fileChangePaths),
    last_edit_operation_position: lastEditPosition,
    last_diff_operation_position: lastDiffPosition,
    blockers,
    required_next_actions: requiredNextActions,
    authorization_effect: "NONE",
  };
}

function qualityEvidence(assessment, convergencePass = 0) {
  return {
    at: now(),
    kind: "worldclass_quality_gate",
    contract: CONTRACT,
    convergence_pass: convergencePass,
    verified: assessment.verified === true,
    risk: assessment.risk,
    changed_file_count: assessment.changed_file_count,
    required_verification_gates: assessment.required_verification_gates,
    fresh_verification_gate_count: assessment.fresh_verification_gate_count,
    fresh_verification_family_count: assessment.fresh_verification_family_count,
    fresh_verification_families: assessment.fresh_verification_families,
    explicit_final_diff_review: assessment.explicit_final_diff_review,
    source_manifest_matches_workspace: assessment.source_manifest_matches_workspace,
    blockers: assessment.blockers,
    required_next_actions: assessment.required_next_actions,
    authorization_effect: "NONE",
  };
}

function attachQuality(
  state,
  assessment,
  { enforceCompletion = false, convergencePass = 0 } = {},
) {
  const source = object(state);
  const evidence = [
    ...list(source.evidence),
    qualityEvidence(assessment, convergencePass),
  ].slice(-MAX_EVIDENCE_ITEMS);
  if (enforceCompletion && assessment.verified !== true) {
    return {
      ...source,
      status: requiredStatus(assessment.blockers),
      blockers: assessment.blockers,
      worldclass_quality: assessment,
      evidence,
      updated_at: now(),
    };
  }
  return {
    ...source,
    worldclass_quality: assessment,
    evidence,
    updated_at: now(),
  };
}

function canAutoConverge(assessment) {
  return (
    assessment?.verified !== true &&
    list(assessment?.required_next_actions).length > 0 &&
    list(assessment?.blockers).every((blocker) =>
      blocker.includes("FINAL_DIFF_REVIEW") ||
      blocker.includes("FRESH_VERIFICATION_GATES")
    )
  );
}

export async function executeWorldClassCodeMission(input = {}) {
  let executionInput = { ...object(input) };
  let convergencePass = 0;

  while (true) {
    const result = await executeAutonomousCodeMission(executionInput);
    if (!result?.state) return result;

    const assessment = assessCodeAIWorldClassQuality(result.state);
    const completed = text(result?.status, 100) === "completed" && result?.success === true;
    const state = attachQuality(result.state, assessment, {
      enforceCompletion: completed,
      convergencePass,
    });

    if (!completed || assessment.verified === true) {
      return {
        ...result,
        state,
        worldclass_quality: assessment,
        worldclass_quality_convergence_passes: convergencePass,
      };
    }

    if (
      !canAutoConverge(assessment) ||
      convergencePass >= MAX_QUALITY_CONVERGENCE_PASSES
    ) {
      return {
        ...result,
        success: false,
        status: state.status,
        reason: assessment.blockers[0] || "CODE_AI_WORLDCLASS_QUALITY_REQUIRED",
        state,
        worldclass_quality: assessment,
        worldclass_quality_convergence_passes: convergencePass,
      };
    }

    convergencePass += 1;
    executionInput = {
      ...executionInput,
      resume_state: state,
    };
  }
}

export const CodeAIWorldClassRuntime = Object.freeze({
  contract: CONTRACT,
  max_quality_convergence_passes: MAX_QUALITY_CONVERGENCE_PASSES,
  assess: assessCodeAIWorldClassQuality,
  execute: executeWorldClassCodeMission,
});
