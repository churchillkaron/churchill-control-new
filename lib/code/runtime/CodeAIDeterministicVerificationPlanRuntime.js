import {
  assessCodeAIWorldClassQuality,
  codeAIVerificationFamily,
  requiredCodeAIVerificationGateCount,
} from "./CodeAIWorldClassQualityPolicy.js";
import {
  assessCodeAIRepairClosure,
} from "./CodeAIRepairClosureRuntime.js";
import {
  assessCodeAIBehavioralVerificationCoverage,
} from "./CodeAIBehavioralVerificationRuntime.js";
import {
  assessCodeAITestProvenance,
} from "./CodeAITestProvenanceRuntime.js";

export const CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT =
  "AVANTIQO_CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_V2";

const JAVASCRIPT_PATH = /\.(?:js|mjs|cjs)$/i;
const PYTHON_PATH = /\.py$/i;

function text(value, maximum = 1200) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map((item) => text(item, 1200)).filter(Boolean))];
}

function changedPaths(state = {}) {
  return unique([
    ...list(state?.files_changed),
    ...list(state?.source_changes).map((item) => item?.path),
  ]);
}

function deletedPaths(state = {}) {
  return new Set(
    list(state?.source_changes)
      .filter((item) => text(item?.operation, 40).toLowerCase() === "delete")
      .map((item) => text(item?.path, 1200))
      .filter(Boolean),
  );
}

function verificationSignature(operation = {}) {
  return JSON.stringify({
    command: text(operation?.input?.command, 300).toLowerCase(),
    args: list(operation?.input?.args).map((item) => text(item, 1200)),
  });
}

function candidate({ id, description, command, args, family, obligation = null }) {
  return {
    id,
    action: "verify",
    description,
    input: { command, args },
    deterministic_verification_family: family,
    deterministic_obligation: obligation,
    controller_owned: true,
    source_mutation_authority: false,
  };
}

function javascriptSyntaxCandidates(paths) {
  return paths
    .filter((filePath) => JAVASCRIPT_PATH.test(filePath))
    .slice(0, 8)
    .map((filePath, index) => candidate({
      id: `deterministic_independent_js_syntax_${index + 1}`,
      description: `Controller-owned JavaScript syntax verification for ${filePath}.`,
      command: "node",
      args: ["--check", filePath],
      family: "syntax",
      obligation: "INDEPENDENT_GATE",
    }));
}

function pythonRuntimeEvidencePresent(state = {}) {
  const guidance = text(state?.repository_guidance?.verification_commands_text, 8000).toLowerCase();
  return /\bpython\b|\bpytest\b|\bmypy\b|\bruff\b/.test(guidance);
}

function pythonSyntaxCandidate(paths, state) {
  const selected = paths.filter((filePath) => PYTHON_PATH.test(filePath)).slice(0, 24);
  if (!selected.length || !pythonRuntimeEvidencePresent(state)) return [];
  return [candidate({
    id: "deterministic_independent_python_syntax_1",
    description:
      "Controller-owned Python compile verification for changed Python source files after repository evidence confirmed a Python runtime convention.",
    command: "python",
    args: ["-m", "compileall", "-q", ...selected],
    family: "syntax",
    obligation: "INDEPENDENT_GATE",
  })];
}

function sourceIntegrityCandidate() {
  return candidate({
    id: "deterministic_independent_source_integrity_1",
    description:
      "Controller-owned source-integrity audit for whitespace errors and malformed conflict-marker style diff defects.",
    command: "git",
    args: ["diff", "--check"],
    family: "command:git",
    obligation: "INDEPENDENT_GATE",
  });
}

function failedVerifierDebtCandidates(repairClosure) {
  return list(repairClosure?.unresolved_failed_verifiers)
    .filter((item) => text(item?.command, 300))
    .slice(0, 8)
    .map((item, index) => {
      const command = text(item.command, 300);
      const args = list(item.args).slice(0, 40).map((arg) => text(arg, 1200));
      return candidate({
        id: `deterministic_failed_verifier_debt_${index + 1}`,
        description:
          "Controller-owned replay of an unresolved failed verifier using the exact original command signature. This debt must pass before completion.",
        command,
        args,
        family: codeAIVerificationFamily({ command, args }),
        obligation: "FAILED_VERIFIER_DEBT",
      });
    });
}

function authoritativeFamily(verifier) {
  if (!verifier?.command) return null;
  return codeAIVerificationFamily({
    command: verifier.command,
    args: list(verifier.args),
  });
}

export function planCodeAIDeterministicVerificationGates({
  state = {},
  authoritative_verification = null,
} = {}) {
  const paths = changedPaths(state);
  const deleted = deletedPaths(state);
  const extantPaths = paths.filter((filePath) => !deleted.has(filePath));
  const quality = assessCodeAIWorldClassQuality(state);
  const risk = text(quality?.risk, 40) || "none";
  const required = requiredCodeAIVerificationGateCount(risk);
  const authoritative = authoritative_verification?.command
    ? {
        command: text(authoritative_verification.command, 300),
        args: list(authoritative_verification.args).slice(0, 24).map((item) => text(item, 500)),
      }
    : null;

  const repairClosure = assessCodeAIRepairClosure(state);
  const behavioralVerification = assessCodeAIBehavioralVerificationCoverage({
    state,
    quality,
  });
  const testProvenance = assessCodeAITestProvenance({
    state,
    quality,
    behavioral_verification: behavioralVerification,
  });

  const initialFamilies = new Set(
    authoritative ? [authoritativeFamily(authoritative)].filter(Boolean) : [],
  );
  const operations = [];
  const signatures = new Set();

  const debtCandidates = failedVerifierDebtCandidates(repairClosure);
  for (const operation of debtCandidates) {
    const signature = verificationSignature(operation);
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    operations.push(operation);
    const family = text(operation.deterministic_verification_family, 120);
    if (family) initialFamilies.add(family);
  }

  const proposed = [
    ...javascriptSyntaxCandidates(extantPaths),
    ...pythonSyntaxCandidate(extantPaths, state),
    sourceIntegrityCandidate(),
  ];

  for (const operation of proposed) {
    if (initialFamilies.size >= required) break;
    const family = text(operation.deterministic_verification_family, 120);
    const signature = verificationSignature(operation);
    if (!family || initialFamilies.has(family) || signatures.has(signature)) continue;
    initialFamilies.add(family);
    signatures.add(signature);
    operations.push(operation);
  }

  const repositorySpecificBehavioralVerificationRequired =
    behavioralVerification.required === true && behavioralVerification.verified !== true;
  const independentTestProvenanceRequired =
    testProvenance.required === true && testProvenance.verified !== true;

  return {
    contract: CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
    risk,
    path_risk: text(quality?.path_risk, 40) || "none",
    repository_impact_risk: text(quality?.repository_impact_risk, 40) || "none",
    risk_source_contract: text(quality?.contract, 160) || null,
    required_verification_gates: required,
    authoritative_verification_present: Boolean(authoritative),
    authoritative_verification_family: authoritativeFamily(authoritative),
    python_runtime_evidence_present: pythonRuntimeEvidencePresent(state),
    failed_verifier_debt_required: repairClosure.required === true,
    failed_verifier_debt_verified: repairClosure.verified === true,
    unresolved_failed_verifier_count:
      Number(repairClosure.unresolved_failed_verifier_count || 0),
    exact_failed_verifier_replay_count: debtCandidates.length,
    repository_specific_behavioral_verification_required:
      repositorySpecificBehavioralVerificationRequired,
    observed_impacted_test_paths: list(behavioralVerification.observed_impacted_test_paths).slice(0, 30),
    independent_test_provenance_required: independentTestProvenanceRequired,
    unchanged_related_test_paths:
      list(testProvenance.unchanged_matched_impacted_test_paths).slice(0, 30),
    unsafe_test_runner_guessing_performed: false,
    planned_independent_gate_count:
      operations.filter((operation) => operation.deterministic_obligation === "INDEPENDENT_GATE").length,
    planned_failed_verifier_debt_count:
      operations.filter((operation) => operation.deterministic_obligation === "FAILED_VERIFIER_DEBT").length,
    planned_families: operations.map((operation) => operation.deterministic_verification_family),
    expected_family_count_after_plan: initialFamilies.size,
    expected_required_gate_count_satisfied: initialFamilies.size >= required,
    all_known_deterministic_debt_planned:
      debtCandidates.length === Number(repairClosure.unresolved_failed_verifier_count || 0),
    operations: operations.map(({
      deterministic_verification_family,
      deterministic_obligation,
      controller_owned,
      source_mutation_authority,
      ...operation
    }) => ({
      ...operation,
      verification_family: deterministic_verification_family,
      obligation: deterministic_obligation,
    })),
    controller_owned: true,
    model_call_performed: false,
    provider_call_performed: false,
    source_mutation_authority: false,
    verification_weakening_allowed: false,
    authorization_effect: "NONE",
  };
}

export const CodeAIDeterministicVerificationPlanRuntime = Object.freeze({
  contract: CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
  plan: planCodeAIDeterministicVerificationGates,
});

export default CodeAIDeterministicVerificationPlanRuntime;
