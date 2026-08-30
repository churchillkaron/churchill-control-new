import {
  codeAIWorldClassRiskForPaths,
  codeAIVerificationFamily,
  requiredCodeAIVerificationGateCount,
} from "./CodeAIWorldClassQualityPolicy.js";

export const CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT =
  "AVANTIQO_CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_V1";

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

function candidate({ id, description, command, args, family }) {
  return {
    id,
    action: "verify",
    description,
    input: { command, args },
    deterministic_verification_family: family,
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
  const risk = codeAIWorldClassRiskForPaths(paths);
  const required = requiredCodeAIVerificationGateCount(risk);
  const authoritative = authoritative_verification?.command
    ? {
        command: text(authoritative_verification.command, 300),
        args: list(authoritative_verification.args).slice(0, 24).map((item) => text(item, 500)),
      }
    : null;
  const initialFamilies = new Set(
    authoritative ? [authoritativeFamily(authoritative)].filter(Boolean) : [],
  );
  const operations = [];
  const signatures = new Set();

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

  return {
    contract: CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
    risk,
    required_verification_gates: required,
    authoritative_verification_present: Boolean(authoritative),
    authoritative_verification_family: authoritativeFamily(authoritative),
    python_runtime_evidence_present: pythonRuntimeEvidencePresent(state),
    planned_independent_gate_count: operations.length,
    planned_families: operations.map((operation) => operation.deterministic_verification_family),
    expected_family_count_after_plan: initialFamilies.size,
    expected_required_gate_count_satisfied: initialFamilies.size >= required,
    operations: operations.map(({ deterministic_verification_family, controller_owned, source_mutation_authority, ...operation }) => operation),
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