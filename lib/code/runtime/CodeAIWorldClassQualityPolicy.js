import {
  codeAIEditAction,
  codeAISourceChangePaths,
} from "./CodeAISourceChangePolicy.js";
import {
  deriveCodeAIRepositoryImpact,
} from "./CodeAIRepositoryImpactRuntime.js";

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

const TEST_PATH_PATTERN =
  /(^|\/)(?:__tests__|tests?|specs?)(\/|$)|\.(?:test|spec)\.[^/]+$/i;
const CI_PATH_PATTERN =
  /(^|\/)(?:\.github\/workflows|\.gitlab-ci(?:\.yml)?|circleci|ci)(\/|$|\.)/i;

const RISK_RANK = Object.freeze({
  none: 0,
  unknown: 0,
  standard: 1,
  high: 2,
  critical: 3,
});

const ADVERSARIAL_DIFF_RULES = Object.freeze([
  {
    id: "FOCUSED_OR_SKIPPED_TEST",
    severity: "block",
    path: TEST_PATH_PATTERN,
    pattern: /\b(?:describe|context|suite|it|test)\.(?:only|skip)\s*\(/i,
  },
  {
    id: "PYTHON_TEST_SKIP",
    severity: "block",
    path: TEST_PATH_PATTERN,
    pattern: /(?:@\s*pytest\.mark\.skip\b|\bpytest\.mark\.skip\b|@\s*unittest\.skip\b)/i,
  },
  {
    id: "TYPECHECK_FILE_DISABLED",
    severity: "block",
    pattern: /@ts-nocheck\b/i,
  },
  {
    id: "TLS_VERIFICATION_DISABLED",
    severity: "block",
    pattern: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0\b/i,
  },
  {
    id: "CI_FAILURE_MASKED",
    severity: "block",
    path: CI_PATH_PATTERN,
    pattern: /(?:\bcontinue-on-error\s*:\s*true\b|\ballow_failure\s*:\s*true\b|\|\|\s*true\b)/i,
  },
  {
    id: "VERIFICATION_SCRIPT_NEUTERED",
    severity: "block",
    path: /(^|\/)package\.json$/i,
    pattern: /"(?:test|verify|check|lint|typecheck|type-check)[^"]*"\s*:\s*"(?:true|exit\s+0)"/i,
  },
  {
    id: "STATIC_ANALYSIS_SUPPRESSION",
    severity: "escalate",
    pattern: /(?:@ts-ignore\b|eslint-disable(?:-next-line|-line)?\b|#\s*noqa\b|type:\s*ignore\b)/i,
  },
  {
    id: "DYNAMIC_CODE_EXECUTION",
    severity: "escalate",
    pattern: /(?:\beval\s*\(|\bnew\s+Function\s*\(|\bshell\s*:\s*true\b)/i,
  },
]);

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

function maximumRisk(...values) {
  return values.reduce((selected, candidate) => {
    const normalized = text(candidate, 40).toLowerCase();
    return (RISK_RANK[normalized] || 0) > (RISK_RANK[selected] || 0)
      ? normalized
      : selected;
  }, "none");
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

export function codeAIWorldClassRiskForRepositoryImpact(impact = {}) {
  if (impact?.evidence_backed !== true) return "none";
  const observedPathCount = Math.max(0, Number(impact?.observed_path_count || 0));
  const observedSurfaces = unique(list(impact?.observed_surfaces));
  const crossSurface = impact?.cross_surface_impact === true;
  const contractAttention = impact?.requires_contract_attention === true;

  // Repository-impact evidence is deliberately allowed to raise verification
  // depth without granting mutation or authorization authority. Because the
  // current map is bounded evidence rather than a full static dependency graph,
  // impact evidence alone can raise work to high risk but never to critical.
  if (
    observedPathCount >= 20 ||
    (crossSurface && observedSurfaces.length >= 5) ||
    (contractAttention && crossSurface && observedSurfaces.length >= 3)
  ) {
    return "high";
  }
  return "none";
}

function repositoryImpactSummary(impact, verificationRisk) {
  return {
    contract: text(impact?.contract, 160) || null,
    evidence_backed: impact?.evidence_backed === true,
    observed_risk: text(impact?.risk, 40) || "unknown",
    verification_risk: verificationRisk,
    observed_path_count: Math.max(0, Number(impact?.observed_path_count || 0)),
    observed_surfaces: unique(list(impact?.observed_surfaces)).slice(0, 24),
    cross_surface_impact: impact?.cross_surface_impact === true,
    requires_contract_attention: impact?.requires_contract_attention === true,
    current_changed_paths: unique(list(impact?.current_changed_paths)).slice(0, 40),
    authorization_effect: "NONE",
  };
}

function addedPatchEntries(patch) {
  const entries = [];
  let currentPath = null;
  let newLine = 0;

  for (const rawLine of String(patch ?? "").split("\n")) {
    if (rawLine.startsWith("+++ ")) {
      const candidate = rawLine.slice(4).trim();
      currentPath = candidate === "/dev/null"
        ? null
        : candidate.replace(/^b\//, "").replace(/^"b\//, "").replace(/"$/, "");
      continue;
    }
    if (rawLine.startsWith("@@")) {
      const match = rawLine.match(/\+(\d+)(?:,(\d+))?/);
      newLine = match ? Number(match[1]) - 1 : 0;
      continue;
    }
    if (!currentPath || rawLine.startsWith("\\ No newline")) continue;
    if (rawLine.startsWith("-")) continue;
    if (rawLine.startsWith("+")) {
      newLine += 1;
      entries.push({
        path: currentPath,
        line: newLine || null,
        content: rawLine.slice(1),
      });
      continue;
    }
    newLine += 1;
  }

  return entries;
}

export function reviewCodeAIWorldClassDiff(state = {}) {
  const findings = [];
  for (const entry of addedPatchEntries(state?.patch)) {
    for (const rule of ADVERSARIAL_DIFF_RULES) {
      if (rule.path && !rule.path.test(entry.path)) continue;
      if (!rule.pattern.test(entry.content)) continue;
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        path: entry.path,
        line: entry.line,
        evidence: text(entry.content, 300),
      });
    }
  }

  const boundedFindings = findings.slice(0, 24);
  const blockingRules = unique(
    boundedFindings
      .filter((finding) => finding.severity === "block")
      .map((finding) => finding.rule),
  );
  const escalationRules = unique(
    boundedFindings
      .filter((finding) => finding.severity === "escalate")
      .map((finding) => finding.rule),
  );

  return {
    contract: "AVANTIQO_CODE_AI_ADVERSARIAL_DIFF_REVIEW_V1",
    verified: blockingRules.length === 0,
    finding_count: findings.length,
    findings_truncated: findings.length > boundedFindings.length,
    findings: boundedFindings,
    blocking_rules: blockingRules,
    escalation_rules: escalationRules,
    risk_escalation_required: escalationRules.length > 0,
    source: "FINAL_PATCH_ADDED_LINES",
    model_call_performed: false,
    provider_call_performed: false,
    authorization_effect: "NONE",
  };
}

function escalateRisk(risk) {
  if (risk === "none") return "standard";
  if (risk === "standard") return "high";
  return "critical";
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
  if (/\b(audit|preflight)\b/.test(joined)) return "audit";
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
  const pathRisk = codeAIWorldClassRiskForPaths(paths);
  const repositoryImpact = deriveCodeAIRepositoryImpact(state);
  const repositoryImpactRisk = codeAIWorldClassRiskForRepositoryImpact(repositoryImpact);
  const baseRisk = maximumRisk(pathRisk, repositoryImpactRisk);
  const adversarialDiffReview = reviewCodeAIWorldClassDiff(state);
  const risk = adversarialDiffReview.risk_escalation_required
    ? escalateRisk(baseRisk)
    : baseRisk;
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
  const repositoryImpactEvidence = repositoryImpactSummary(repositoryImpact, repositoryImpactRisk);

  if (!paths.length) {
    return {
      contract: CONTRACT,
      verified: true,
      risk: "none",
      path_risk: "none",
      repository_impact_risk: "none",
      repository_impact: repositoryImpactEvidence,
      risk_basis: {
        changed_paths: "none",
        repository_impact: "none",
        adversarial_diff_escalation: false,
      },
      changed_file_count: 0,
      changed_paths: [],
      required_verification_gates: 0,
      fresh_verification_gate_count: 0,
      fresh_verification_family_count: 0,
      fresh_verification_families: [],
      fresh_verification_operations: [],
      explicit_final_diff_review: true,
      source_manifest_matches_workspace: true,
      adversarial_diff_review: adversarialDiffReview,
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
  if (adversarialDiffReview.verified !== true) {
    blockers.push(
      `CODE_AI_WORLDCLASS_ADVERSARIAL_DIFF_REVIEW_REQUIRED:${adversarialDiffReview.blocking_rules.join(",")}`,
    );
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
  if (blockers.some((blocker) => blocker.includes("ADVERSARIAL_DIFF_REVIEW"))) {
    requiredNextActions.push("apply_files", "verify", "diff");
  } else {
    if (blockers.some((blocker) => blocker.includes("DIFF_REVIEW"))) requiredNextActions.push("diff");
    if (blockers.some((blocker) => blocker.includes("VERIFICATION_GATES"))) requiredNextActions.push("verify");
  }

  return {
    contract: CONTRACT,
    verified: blockers.length === 0,
    risk,
    path_risk: pathRisk,
    repository_impact_risk: repositoryImpactRisk,
    repository_impact: repositoryImpactEvidence,
    risk_basis: {
      changed_paths: pathRisk,
      repository_impact: repositoryImpactRisk,
      adversarial_diff_escalation: adversarialDiffReview.risk_escalation_required === true,
    },
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
    adversarial_diff_review: adversarialDiffReview,
    blockers,
    required_next_actions: unique(requiredNextActions),
    authorization_effect: "NONE",
  };
}

export const CodeAIWorldClassQualityPolicy = Object.freeze({
  contract: CONTRACT,
  assess: assessCodeAIWorldClassQuality,
  riskForPaths: codeAIWorldClassRiskForPaths,
  riskForRepositoryImpact: codeAIWorldClassRiskForRepositoryImpact,
  reviewDiff: reviewCodeAIWorldClassDiff,
  verificationFamily: codeAIVerificationFamily,
  requiredVerificationGateCount: requiredCodeAIVerificationGateCount,
  requiredStatus: codeAIWorldClassRequiredStatus,
});