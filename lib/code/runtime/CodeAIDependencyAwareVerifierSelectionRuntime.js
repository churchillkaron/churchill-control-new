import { deriveCodeAICausalGraph } from "./CodeAIWorldClassIntelligenceRuntime.js";

export const CODE_AI_DEPENDENCY_AWARE_VERIFIER_SELECTION_CONTRACT =
  "AVANTIQO_CODE_AI_DEPENDENCY_AWARE_VERIFIER_SELECTION_V2";

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

const MAX_CONSUMER_HOPS = 3;
const MAX_TRAVERSED_NODES = 120;

function changedSchemaSeeds(graph, changed) {
  return unique(list(graph?.changed_schema_impacts)
    .filter((impact) => changed.has(text(impact?.changed_path, 1200)))
    .map((impact) => impact?.schema_id));
}

function reverseConsumerIndex(graph) {
  const index = new Map();
  for (const edge of list(graph?.edges)) {
    const dependency = text(edge?.to, 1200);
    const consumer = text(edge?.from, 1200);
    if (!dependency || !consumer || dependency === consumer) continue;
    const current = index.get(dependency) || [];
    const normalized = {
      consumer,
      relation: text(edge?.relation, 120),
      target_symbol: text(edge?.target_symbol, 240) || null,
      syntax_evidence: text(edge?.syntax_evidence, 80) || null,
    };
    const existingIndex = current.findIndex((item) => item.consumer === consumer);
    if (existingIndex < 0) current.push(normalized);
    else if (normalized.relation === "calls_imported_symbol" && current[existingIndex].relation !== "calls_imported_symbol") {
      current[existingIndex] = normalized;
    }
    index.set(dependency, current);
  }
  return index;
}

function scoreForPath({ depth, schemaSeed, terminalRelation }) {
  if (depth <= 1) {
    if (schemaSeed) return 96;
    return terminalRelation === "calls_imported_symbol" ? 100 : 92;
  }
  const base = schemaSeed ? 92 : 94;
  return Math.max(70, base - ((depth - 1) * 8));
}

function reasonForPath({ path, seed, depth, schemaSeed, chain }) {
  if (depth === 1 && !schemaSeed) {
    const edge = chain[0] || {};
    return edge.relation === "calls_imported_symbol"
      ? `Observed test calls changed symbol ${edge.target_symbol || "unknown"} from ${seed}.`
      : `Observed test imports changed module ${seed}.`;
  }
  if (depth === 1 && schemaSeed) return `Observed test depends on changed schema object ${seed}.`;
  const route = [seed, ...chain.map((edge) => edge.consumer)].join(" -> ");
  return `Observed ${depth}-hop blast-radius path from ${schemaSeed ? "changed schema object" : "changed source"} to test: ${route}.`;
}

function transitiveTestCandidates(graph, changed) {
  const reverse = reverseConsumerIndex(graph);
  const seeds = [
    ...[...changed].map((seed) => ({ seed, schemaSeed: false })),
    ...changedSchemaSeeds(graph, changed).map((seed) => ({ seed, schemaSeed: true })),
  ];
  const ranked = [];
  let traversed = 0;

  for (const seedEntry of seeds) {
    const queue = [{ node: seedEntry.seed, depth: 0, chain: [] }];
    const bestDepth = new Map([[seedEntry.seed, 0]]);
    while (queue.length && traversed < MAX_TRAVERSED_NODES) {
      const current = queue.shift();
      if (current.depth >= MAX_CONSUMER_HOPS) continue;
      for (const edge of list(reverse.get(current.node))) {
        traversed += 1;
        const depth = current.depth + 1;
        const priorDepth = bestDepth.get(edge.consumer);
        if (priorDepth !== undefined && priorDepth <= depth) continue;
        bestDepth.set(edge.consumer, depth);
        const chain = [...current.chain, edge];
        if (TEST_PATH.test(edge.consumer)) {
          ranked.push({
            path: edge.consumer,
            score: scoreForPath({ depth, schemaSeed: seedEntry.schemaSeed, terminalRelation: edge.relation }),
            reason: reasonForPath({ path: edge.consumer, seed: seedEntry.seed, depth, schemaSeed: seedEntry.schemaSeed, chain }),
            dependency_relation: edge.relation,
            dependency_target: seedEntry.seed,
            dependency_depth: depth,
            dependency_chain: chain.map((item) => ({
              consumer: item.consumer,
              relation: item.relation,
              target_symbol: item.target_symbol,
              syntax_evidence: item.syntax_evidence,
            })),
            schema_seed: seedEntry.schemaSeed,
          });
        }
        if (!TEST_PATH.test(edge.consumer) && depth < MAX_CONSUMER_HOPS) {
          queue.push({ node: edge.consumer, depth, chain });
        }
        if (traversed >= MAX_TRAVERSED_NODES) break;
      }
    }
  }
  return { ranked, traversed };
}

export function selectCodeAIDependencyAwareVerifiers({ state = {}, causal_graph = null } = {}) {
  const graph = causal_graph || deriveCodeAICausalGraph(state);
  const changed = changedPaths(state);
  const traversal = transitiveTestCandidates(graph, changed);
  const candidates = traversal.ranked;
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
    max_consumer_hops: MAX_CONSUMER_HOPS,
    traversed_consumer_edges: traversal.traversed,
    multi_hop_candidate_count: ranked.filter((item) => Number(item.dependency_depth || 0) > 1).length,
    blast_radius_bounded: true,
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
