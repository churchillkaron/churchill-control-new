import { deriveCodeAICausalGraph } from "./CodeAIWorldClassIntelligenceRuntime.js";

export const CODE_AI_DEPENDENCY_AWARE_VERIFIER_SELECTION_CONTRACT =
  "AVANTIQO_CODE_AI_DEPENDENCY_AWARE_VERIFIER_SELECTION_V1";

const TEST_PATH = /(^|\/)(?:__tests__|tests?|specs?|e2e)(\/|$)|\.(?:test|spec)\.[^/]+$/i;
const UI_TEST_PATH = /(^|\/)(?:e2e|playwright|cypress)(\/|$)|\.(?:browser|e2e)\.[^/]+$/i;
const API_TEST_PATH = /(?:api|integration|route|rpc|service|worker)/i;

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
  return new Set(unique([
    ...list(state?.files_changed),
    ...list(state?.source_changes).map((entry) => entry?.path),
  ]));
}

function commandForObservedTest(path) {
  const target = text(path, 1200);
  if (!target) return null;
  if (/\.(?:test|spec)\.m?js$/i.test(target) || /(^|\/)tests?\/.*\.m?js$/i.test(target)) {
    return { command: "node", args: ["--test", target] };
  }
  if (/\.py$/i.test(target)) {
    return { command: "python", args: ["-m", "pytest", target] };
  }
  return null;
}

function familyForPath(path) {
  if (UI_TEST_PATH.test(path)) return "browser_e2e";
  if (API_TEST_PATH.test(path)) return "api_integration";
  return "tests";
}

function directCodeTestCandidates(graph, changed) {
  const ranked = [];
  for (const edge of list(graph?.edges)) {
    const from = text(edge?.from, 1200);
    const to = text(edge?.to, 1200);
    if (!TEST_PATH.test(from) || !changed.has(to)) continue;
    ranked.push({
      path: from,
      score: edge?.relation === "calls_imported_symbol" ? 100 : 92,
      reason: edge?.relation === "calls_imported_symbol"
        ? `Observed test calls changed symbol ${text(edge?.target_symbol, 240) || "unknown"} from ${to}.`
        : `Observed test imports changed module ${to}.`,
      dependency_relation: text(edge?.relation, 120),
      dependency_target: to,
    });
  }
  return ranked;
}

function schemaTestCandidates(graph) {
  const ranked = [];
  for (const impact of list(graph?.changed_schema_impacts)) {
    const schemaId = text(impact?.schema_id, 1200);
    if (!schemaId) continue;
    for (const consumer of list(impact?.observed_consumers)) {
      const path = text(consumer?.path, 1200);
      if (!TEST_PATH.test(path)) continue;
      ranked.push({
        path,
        score: 96,
        reason: `Observed test depends on changed schema object ${schemaId}.`,
        dependency_relation: text(consumer?.relation, 120),
        dependency_target: schemaId,
      });
    }
  }
  return ranked;
}

export function selectCodeAIDependencyAwareVerifiers({ state = {}, causal_graph = null } = {}) {
  const graph = causal_graph || deriveCodeAICausalGraph(state);
  const changed = changedPaths(state);
  const candidates = [...directCodeTestCandidates(graph, changed), ...schemaTestCandidates(graph)];
  const bestByPath = new Map();
  for (const candidate of candidates) {
    const prior = bestByPath.get(candidate.path);
    if (!prior || candidate.score > prior.score) bestByPath.set(candidate.path, candidate);
  }
  const ranked = [...bestByPath.values()]
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 12)
    .map((entry) => ({
      ...entry,
      family: familyForPath(entry.path),
      verifier: commandForObservedTest(entry.path),
      executable: Boolean(commandForObservedTest(entry.path)),
    }));

  return {
    contract: CODE_AI_DEPENDENCY_AWARE_VERIFIER_SELECTION_CONTRACT,
    graph_contract: text(graph?.contract, 180) || null,
    selected_count: ranked.length,
    executable_count: ranked.filter((item) => item.executable).length,
    selected_test_paths: ranked.map((item) => item.path),
    candidates: ranked,
    current_repository_evidence_required: true,
    unsafe_test_runner_guessing_performed: false,
    model_call_performed: false,
    provider_call_performed: false,
    source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

export const CodeAIDependencyAwareVerifierSelectionRuntime = Object.freeze({
  contract: CODE_AI_DEPENDENCY_AWARE_VERIFIER_SELECTION_CONTRACT,
  select: selectCodeAIDependencyAwareVerifiers,
});

export default CodeAIDependencyAwareVerifierSelectionRuntime;
