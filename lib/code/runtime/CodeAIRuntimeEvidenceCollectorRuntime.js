import { CodeWorkspaceRuntime } from "./CodeWorkspaceRuntime.js";
import { assessCodeAIRuntimeEvidenceCoverage } from "./CodeAIRuntimeEvidenceCoverageRuntime.js";

export const CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_CONTRACT =
  "AVANTIQO_CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_V1";

const MAX_PROBES = 4;
const MAX_OUTPUT = 2400;
const UI_RUNTIME_PATH = /(^|\/)(?:e2e|playwright|cypress)(\/|$)|\.(?:e2e|browser)\.(?:js|jsx|ts|tsx|mjs|cjs)$/i;
const API_RUNTIME_PATH = /(^|\/)(?:integration|api|routes?|rpc)(\/|$)|\.(?:integration|api)\.(?:js|jsx|ts|tsx|mjs|cjs)$/i;
const NODE_TEST_PATH = /\.(?:test|spec|e2e|browser|integration|api)\.(?:js|mjs|cjs)$/i;
const PLAYWRIGHT_PATH = /(^|\/)(?:e2e|playwright)(\/|$)|\.(?:e2e|browser)\.(?:ts|tsx)$/i;
const CYPRESS_PATH = /(^|\/)cypress(\/|$)/i;

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
function bounded(value) {
  return text(value, MAX_OUTPUT);
}

function commandForTest(filePath) {
  const path = text(filePath, 1200);
  if (!path) return null;
  if (CYPRESS_PATH.test(path)) {
    return { command: "npx", args: ["cypress", "run", "--spec", path], family: "browser_e2e" };
  }
  if (NODE_TEST_PATH.test(path)) {
    return {
      command: "node",
      args: ["--test", path],
      family: UI_RUNTIME_PATH.test(path) ? "browser_e2e" : "api_integration",
    };
  }
  if (PLAYWRIGHT_PATH.test(path)) {
    return { command: "npx", args: ["playwright", "test", path], family: "browser_e2e" };
  }
  return null;
}

export function planCodeAIRuntimeEvidenceCollection({
  state = {},
  quality = {},
  behavioral_verification = null,
} = {}) {
  const behavioral = object(behavioral_verification);
  const coverage = assessCodeAIRuntimeEvidenceCoverage({
    state,
    quality,
    behavioral_verification: behavioral,
  });
  if (!coverage.required || coverage.verified) {
    return {
      contract: CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_CONTRACT,
      required: coverage.required,
      applicable: false,
      reason: coverage.required ? "RUNTIME_EVIDENCE_ALREADY_VERIFIED" : "RUNTIME_EVIDENCE_NOT_REQUIRED",
      coverage,
      probes: [],
    };
  }

  const observed = unique([
    ...list(behavioral.observed_impacted_test_paths),
    ...list(behavioral.matched_impacted_test_paths),
  ]);
  const needsUi = list(coverage.missing_evidence).includes("UI_BROWSER_OR_E2E_RUNTIME_EVIDENCE");
  const needsApi = list(coverage.missing_evidence).includes("API_RUNTIME_OR_TARGETED_INTEGRATION_EVIDENCE");
  const candidates = observed.filter((path) =>
    (needsUi && UI_RUNTIME_PATH.test(path)) ||
    (needsApi && (API_RUNTIME_PATH.test(path) || NODE_TEST_PATH.test(path)))
  );
  const probes = candidates
    .map((path) => ({ path, ...object(commandForTest(path)) }))
    .filter((probe) => probe.command)
    .slice(0, MAX_PROBES);

  return {
    contract: CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_CONTRACT,
    required: true,
    applicable: probes.length > 0,
    reason: probes.length ? null : "NO_DETERMINISTIC_RUNTIME_PROBE_AVAILABLE",
    coverage,
    probes,
    model_call_required: false,
    source_mutation_authority: false,
    commit_authority: false,
    deploy_authority: false,
    authorization_effect: "NONE",
  };
}

export async function collectCodeAIRuntimeEvidence({
  state = {},
  quality = {},
  behavioral_verification = null,
  openWorkspace = CodeWorkspaceRuntime.open,
} = {}) {
  const source = object(state);
  const plan = planCodeAIRuntimeEvidenceCollection({ state: source, quality, behavioral_verification });
  if (!plan.applicable) {
    return { ...plan, collected: false, evidence: [], probe_results: [] };
  }
  const repositoryUrl = text(source.repository_url, 1000);
  if (!repositoryUrl) throw new Error("CODE_AI_RUNTIME_EVIDENCE_REPOSITORY_REQUIRED");
  const workspace = await openWorkspace({
    repository_url: repositoryUrl,
    ref: text(source.ref, 160) || "main",
    resume_patch: text(source.patch, 900000) || null,
    timeout_ms: 180000,
    workspace_target: text(source?.objective_context?.workspace_target, 80) || undefined,
  });
  const results = [];
  try {
    for (const probe of plan.probes) {
      let result;
      try {
        result = await workspace.run({
          command: probe.command,
          args: probe.args,
          timeout_ms: 120000,
        });
      } catch (error) {
        result = {
          exit_code: 125,
          stdout: "",
          stderr: text(error?.message || error, MAX_OUTPUT),
        };
      }
      results.push({
        path: probe.path,
        family: probe.family,
        command: probe.command,
        args: probe.args,
        exit_code: Number(result?.exit_code ?? 125),
        stdout: bounded(result?.stdout),
        stderr: bounded(result?.stderr),
      });
    }
  } finally {
    await workspace.stop().catch(() => null);
  }

  const evidence = results
    .filter((result) => result.exit_code === 0)
    .map((result) => ({
      at: new Date().toISOString(),
      kind: result.family,
      source: "CODE_AI_DETERMINISTIC_RUNTIME_EVIDENCE_COLLECTOR",
      verified: true,
      passed: true,
      test_path: result.path,
      command: result.command,
      args: result.args,
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      final_patch_replayed_in_isolated_workspace: true,
      provider_call_performed: false,
      model_call_performed: false,
      authorization_effect: "NONE",
    }));

  return {
    ...plan,
    collected: results.length > 0,
    evidence,
    probe_results: results,
    passed_probe_count: evidence.length,
    failed_probe_count: results.length - evidence.length,
  };
}

export const CodeAIRuntimeEvidenceCollectorRuntime = Object.freeze({
  contract: CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_CONTRACT,
  plan: planCodeAIRuntimeEvidenceCollection,
  collect: collectCodeAIRuntimeEvidence,
  max_probes: MAX_PROBES,
  model_call_required: false,
  source_mutation_authority: false,
  commit_authority: false,
  deploy_authority: false,
});

export default CodeAIRuntimeEvidenceCollectorRuntime;
