export const CODE_AI_WORLD_CLASS_INTELLIGENCE_CONTRACT =
  "AVANTIQO_CODE_AI_WORLD_CLASS_INTELLIGENCE_V1";

const MAX_OBJECTIVE_CHARS = 18000;
const HIGH_RISK = new Set(["high", "critical"]);

function text(value, maximum = 6000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.map((value) => text(value, 1000)).filter(Boolean))];
}

function boundedNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function pathEvidence(state) {
  const source = object(state);
  const paths = [
    ...list(source.files_changed),
    ...list(source.source_changes).map((entry) => entry?.path),
    ...list(source.declared_evidence_reads).map((entry) => entry?.result?.file_path),
    ...list(source.evidence).map((entry) => entry?.result?.file_path),
  ];
  return unique(paths).slice(0, 80);
}

export function deriveCodeAICausalGraph(state = {}) {
  const source = object(state);
  const paths = pathEvidence(source);
  const changed = new Set(unique([
    ...list(source.files_changed),
    ...list(source.source_changes).map((entry) => entry?.path),
  ]));
  const nodes = paths.map((path) => ({
    id: path,
    kind: changed.has(path) ? "changed" : "evidence",
  }));
  const changedPaths = paths.filter((path) => changed.has(path));
  const evidencePaths = paths.filter((path) => !changed.has(path));
  const edges = [];
  for (const target of changedPaths.slice(0, 24)) {
    for (const evidence of evidencePaths.slice(0, 24)) {
      edges.push({ from: evidence, to: target, relation: "observed_context" });
      if (edges.length >= 120) break;
    }
    if (edges.length >= 120) break;
  }
  return {
    contract: "AVANTIQO_CODE_AI_CAUSAL_GRAPH_V1",
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
    authoritative_dependency_parser: false,
    purpose: "BOUNDARY_AND_BLAST_RADIUS_REASONING",
    authorization_effect: "NONE",
  };
}

function normalizeCandidate(candidate, fallbackId) {
  const source = object(candidate);
  return {
    id: text(source.id || fallbackId, 120),
    direction: text(source.direction || source.recommendation || source.alternative, 2200),
    source: text(source.source, 120) || "derived",
    confidence: boundedNumber(source.confidence, 0, 1, 0.5),
    risks: unique(list(source.risks)).slice(0, 12),
    verification: unique(list(source.verification)).slice(0, 12),
  };
}

function candidateScore(candidate, { risk = "unknown", runtimeEvidenceCount = 0 } = {}) {
  const direction = text(candidate.direction, 2200).toLowerCase();
  let score = 50;
  score += Math.round(candidate.confidence * 20);
  score += Math.min(12, candidate.verification.length * 3);
  score -= Math.min(15, candidate.risks.length * 2);
  if (/root cause|reuse|existing|canonical|bounded|central/.test(direction)) score += 8;
  if (/duplicate|workaround|temporary|bypass|disable test|skip test/.test(direction)) score -= 16;
  if (/cache|batch|parallel|state machine|lifecycle|ownership|atomic|idempotent/.test(direction)) score += 3;
  if (HIGH_RISK.has(risk) && candidate.verification.length >= 2) score += 5;
  if (runtimeEvidenceCount > 0 && /runtime|trace|log|metric|browser|behavior/.test(direction)) score += 4;
  return Math.max(0, Math.min(100, score));
}

export function competeCodeAISolutionStrategies({
  specialist_review = null,
  repository_impact = null,
  runtime_evidence = null,
} = {}) {
  const review = object(specialist_review);
  const risk = text(repository_impact?.risk, 80).toLowerCase() || "unknown";
  const runtimeEvidenceCount = list(runtime_evidence).length;
  const candidates = [normalizeCandidate({
    id: "bounded_root_cause",
    direction: "Prefer the smallest repository-backed root-cause repair that reuses existing canonical architecture and preserves compatibility.",
    source: "platform_baseline",
    confidence: 0.72,
    verification: ["targeted verification", "fresh final diff"],
  }, "bounded_root_cause")];

  for (const item of list(review.reviews)) {
    if (item?.success !== true) continue;
    if (text(item.recommendation)) {
      candidates.push(normalizeCandidate({
        ...item,
        id: `${text(item.role, 80) || "specialist"}_recommendation`,
        direction: item.recommendation,
        source: text(item.role, 80) || "specialist",
      }, "specialist_recommendation"));
    }
    if (text(item.alternative)) {
      candidates.push(normalizeCandidate({
        ...item,
        id: `${text(item.role, 80) || "specialist"}_alternative`,
        direction: item.alternative,
        source: `${text(item.role, 80) || "specialist"}:alternative`,
        confidence: Math.max(0.2, Number(item.confidence || 0.5) - 0.1),
      }, "specialist_alternative"));
    }
  }

  const ranked = candidates
    .filter((candidate) => candidate.direction)
    .map((candidate) => ({
      ...candidate,
      score: candidateScore(candidate, { risk, runtimeEvidenceCount }),
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const winner = ranked[0] || null;
  const rejected = ranked[1] || null;
  return {
    contract: "AVANTIQO_CODE_AI_SOLUTION_STRATEGY_COMPETITION_V1",
    candidate_count: ranked.length,
    ranked,
    selected: winner,
    strongest_rejected: rejected,
    selection_margin: winner && rejected ? winner.score - rejected.score : winner?.score || 0,
    additional_reasoning_calls: 0,
    source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

export function formatCodeAISolutionStrategyCompetitionForObjective(value) {
  const competition = object(value);
  const selected = text(competition?.selected?.direction, 1800);
  if (!selected) return "";
  const rejected = text(competition?.strongest_rejected?.direction, 1600);
  return [
    "DETERMINISTIC SOLUTION STRATEGY COMPETITION:",
    `Selected direction: ${selected}`,
    rejected ? `Strongest rejected alternative: ${rejected}` : null,
    `Selection evidence: ${Number(competition.candidate_count || 0)} ranked candidate directions; selection margin ${Number(competition.selection_margin || 0)}; no additional Code reasoning call consumed.`,
    "Treat this as advisory strategy evidence. Fresh repository evidence, owner intent, deterministic verification and governance remain authoritative.",
  ].filter(Boolean).join("\n");
}

export function resolveCodeAIAdaptiveReasoningBudget({
  objective,
  state = null,
  repository_impact = null,
  strategy_competition = null,
} = {}) {
  const source = object(state);
  const risk = text(repository_impact?.risk, 80).toLowerCase() || "unknown";
  const ambiguity = Number(strategy_competition?.selection_margin || 0) < 8;
  const failureCount = list(source.failures).length;
  const objectiveText = text(objective, 9000);
  const strategic = /architecture|performance|security|concurrency|migration|schema|reliability|world[- ]?class/i.test(objectiveText);
  let recommended = 2;
  if (strategic) recommended += 1;
  if (HIGH_RISK.has(risk)) recommended += 2;
  if (ambiguity) recommended += 1;
  if (failureCount > 0) recommended += 1;
  if (failureCount > 2) recommended += 1;
  return {
    contract: "AVANTIQO_CODE_AI_ADAPTIVE_REASONING_BUDGET_V1",
    recommended_reasoning_calls: Math.min(8, recommended),
    minimum_reasoning_calls: 1,
    maximum_reasoning_calls: 8,
    ambiguity_detected: ambiguity,
    repository_risk: risk,
    deterministic_evidence_should_resolve_first: true,
    authorization_effect: "NONE",
  };
}

function negativeMemory(state = {}, objectiveContext = {}) {
  const source = object(state);
  const context = object(objectiveContext);
  return unique([
    ...list(source.negative_engineering_memory),
    ...list(context.negative_engineering_memory),
    ...list(source.failures).map((entry) => entry?.message || entry?.reason),
    ...list(source.rejected_duplicate_actions).map((entry) => entry?.reason || entry?.action),
  ]).slice(-24);
}

function runtimeEvidence(state = {}, objectiveContext = {}) {
  return list([
    ...list(state?.runtime_evidence),
    ...list(objectiveContext?.runtime_evidence),
    ...list(objectiveContext?.browser_evidence),
    ...list(objectiveContext?.trace_evidence),
    ...list(objectiveContext?.metric_evidence),
  ]).filter(Boolean).slice(-40);
}

function benchmarkScorecard(state = {}) {
  const source = object(state);
  const tests = list(source.tests);
  const verification = list(source.verification);
  const passed = verification.filter((entry) => entry?.passed === true).length;
  const failed = verification.filter((entry) => entry?.passed === false).length;
  const failures = list(source.failures).length;
  const repairs = list(source.repairs).length;
  return {
    contract: "AVANTIQO_CODE_AI_ENGINEERING_SCOREBOARD_V1",
    tests_observed: tests.length,
    verification_passed: passed,
    verification_failed: failed,
    repair_count: repairs,
    failure_count: failures,
    first_pass_success: failures === 0 && passed > 0,
    human_intervention_count: Number(source?.owner_intervention?.revision || 0),
    reasoning_calls_used: Number(source?.work_package_control?.reasoning_calls_used || 0),
    score: Math.max(0, Math.min(100, 70 + passed * 5 - failed * 12 - failures * 4 + Math.min(10, repairs * 2))),
  };
}

function proactiveDiscovery({ causalGraph, scoreboard, negative }) {
  const opportunities = [];
  if (causalGraph.node_count > 18) opportunities.push("Consider whether repeated cross-surface coupling should be centralized behind an existing canonical boundary.");
  if (scoreboard.failure_count >= 2) opportunities.push("Inspect repeated failure signatures for a reusable prevention or verification rule.");
  if (negative.length >= 4) opportunities.push("Promote repeated rejected approaches into durable negative engineering memory or an engineering skill guardrail.");
  return opportunities.slice(0, 6);
}

function businessRecoveryContext(options = {}) {
  const context = object(options.objective_context);
  const metadata = object(options.context?.metadata);
  const active = Boolean(
    context.business_partner_recovery ||
    context.failed_capability_key ||
    metadata.business_partner_recovery ||
    metadata.platform_self_healing
  );
  return {
    contract: "AVANTIQO_CODE_AI_CROSS_DOMAIN_RECOVERY_V1",
    active,
    failed_capability_key: text(context.failed_capability_key || metadata.failed_capability_key, 240) || null,
    replay_original_business_action_after_verified_repair: active,
    business_partner_and_code_studio_same_employee: true,
  };
}

export function resolveCodeAIIsolatedCandidateCompetitionPolicy({ risk, strategyCompetition }) {
  const ambiguous = Number(strategyCompetition?.selection_margin || 0) < 8;
  const enabled = HIGH_RISK.has(text(risk, 80).toLowerCase()) && ambiguous;
  return {
    contract: "AVANTIQO_CODE_AI_ISOLATED_CANDIDATE_COMPETITION_V1",
    enabled,
    candidate_count: enabled ? 2 : 1,
    isolation_required: enabled,
    main_branch_parallel_mutation_forbidden: true,
    winner_requires_deterministic_verification: true,
    fallback_when_isolation_unavailable: "PLAN_SHAPE_COMPETITION_ONLY",
  };
}

function formatWorldClassDirective(control) {
  const selected = text(control?.solution_strategy_competition?.selected?.direction, 1600);
  const rejected = text(control?.solution_strategy_competition?.strongest_rejected?.direction, 1200);
  const negative = list(control?.negative_engineering_memory).slice(-6);
  const proactive = list(control?.proactive_improvement_opportunities).slice(0, 4);
  return [
    "AVANTIQO WORLD-CLASS ENGINEERING CONTROL V1",
    selected ? `SELECTED STRATEGY: ${selected}` : null,
    rejected ? `STRONGEST REJECTED ALTERNATIVE: ${rejected}` : null,
    `ADAPTIVE REASONING BUDGET: ${Number(control?.adaptive_reasoning_budget?.recommended_reasoning_calls || 0)} calls maximum unless deterministic evidence closes the task earlier.`,
    `CAUSAL GRAPH: ${Number(control?.causal_graph?.node_count || 0)} nodes / ${Number(control?.causal_graph?.edge_count || 0)} observed-context edges. Inspect true callers/contracts before broad mutation.`,
    `RUNTIME EVIDENCE ITEMS: ${Number(control?.runtime_evidence_count || 0)}. Prefer behavioral/browser/log/trace/metric evidence over guesswork when present.`,
    control?.isolated_candidate_competition?.enabled
      ? "CANDIDATE COMPETITION: when supported, compare two isolated implementation candidates and deterministically verify both; never run parallel source mutation on main."
      : "CANDIDATE COMPETITION: use the selected strategy directly; do not create extra variants without evidence that ambiguity justifies them.",
    negative.length ? `KNOWN FAILED/NEGATIVE APPROACHES: ${negative.join(" | ")}` : null,
    proactive.length ? `PROACTIVE FOLLOW-UPS AFTER THE OWNER GOAL IS COMPLETE: ${proactive.join(" | ")}` : null,
    "Do not weaken tests, governance, authorization, migrations, security, completion criteria or final review. Do not expose private chain-of-thought; persist only decision records and evidence.",
  ].filter(Boolean).join("\n");
}

export function prepareCodeAIWorldClassMission(options = {}) {
  const state = object(options.resume_state);
  const objectiveContext = object(options.objective_context || state.objective_context);
  const runtime = runtimeEvidence(state, objectiveContext);
  const causalGraph = deriveCodeAICausalGraph(state);
  const competition = competeCodeAISolutionStrategies({
    specialist_review: state.parallel_specialist_review,
    repository_impact: state.repository_impact,
    runtime_evidence: runtime,
  });
  const budget = resolveCodeAIAdaptiveReasoningBudget({
    objective: options.objective,
    state,
    repository_impact: state.repository_impact,
    strategy_competition: competition,
  });
  const negative = negativeMemory(state, objectiveContext);
  const scoreboard = benchmarkScorecard(state);
  const recovery = businessRecoveryContext(options);
  const isolated = resolveCodeAIIsolatedCandidateCompetitionPolicy({
    risk: state?.repository_impact?.risk,
    strategyCompetition: competition,
  });
  const proactive = proactiveDiscovery({ causalGraph, scoreboard, negative });
  const control = {
    contract: CODE_AI_WORLD_CLASS_INTELLIGENCE_CONTRACT,
    solution_strategy_competition: competition,
    causal_graph: causalGraph,
    runtime_evidence_count: runtime.length,
    runtime_evidence_loop_enabled: true,
    isolated_candidate_competition: isolated,
    adaptive_reasoning_budget: budget,
    negative_engineering_memory: negative,
    benchmark_scorecard: scoreboard,
    cross_domain_business_recovery: recovery,
    proactive_improvement_opportunities: proactive,
    measured_intelligence_scoreboard_enabled: true,
    code_studio_business_partner_convergence: true,
    additional_reasoning_calls_required_by_control_plane: 0,
    mutation_authority: false,
    commit_authority: false,
    deploy_authority: false,
    raw_reasoning_persisted: false,
  };
  const directive = formatWorldClassDirective(control);
  const objective = [text(options.objective, 12000), directive]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_OBJECTIVE_CHARS);
  return {
    options: {
      ...options,
      objective,
      objective_context: {
        ...objectiveContext,
        world_class_intelligence_contract: CODE_AI_WORLD_CLASS_INTELLIGENCE_CONTRACT,
        adaptive_reasoning_budget: budget.recommended_reasoning_calls,
        runtime_evidence_count: runtime.length,
        cross_domain_business_recovery: recovery.active,
      },
      reasoning_call_budget: options.reasoning_call_budget || budget.recommended_reasoning_calls,
    },
    control,
  };
}

export function finalizeCodeAIWorldClassMission({
  prepared_control = null,
  result = null,
  options = null,
} = {}) {
  const base = object(prepared_control);
  const resultObject = object(result);
  const state = object(resultObject.state || resultObject);
  const objectiveContext = object(
    state.objective_context || options?.objective_context,
  );
  const runtime = runtimeEvidence(state, objectiveContext);
  const causalGraph = deriveCodeAICausalGraph(state);
  const strategyCompetition = Object.keys(object(state.solution_strategy_competition)).length
    ? object(state.solution_strategy_competition)
    : object(base.solution_strategy_competition);
  const negative = negativeMemory(state, objectiveContext);
  const scoreboard = benchmarkScorecard(state);
  const proactive = proactiveDiscovery({
    causalGraph,
    scoreboard,
    negative,
  });
  return {
    ...base,
    solution_strategy_competition: strategyCompetition,
    isolated_candidate_competition:
      Object.keys(object(state.isolated_candidate_competition)).length
        ? object(state.isolated_candidate_competition)
        : object(base.isolated_candidate_competition),
    causal_graph: causalGraph,
    runtime_evidence_count: runtime.length,
    negative_engineering_memory: negative,
    benchmark_scorecard: scoreboard,
    proactive_improvement_opportunities: proactive,
    finalization_contract: "AVANTIQO_CODE_AI_WORLD_CLASS_FINALIZATION_V1",
    finalized_from_execution_result: true,
    measured_intelligence_scoreboard_enabled: true,
    mutation_authority: false,
    commit_authority: false,
    deploy_authority: false,
    raw_reasoning_persisted: false,
  };
}

export const CodeAIWorldClassIntelligenceRuntime = Object.freeze({
  contract: CODE_AI_WORLD_CLASS_INTELLIGENCE_CONTRACT,
  prepare: prepareCodeAIWorldClassMission,
  finalize: finalizeCodeAIWorldClassMission,
  causalGraph: deriveCodeAICausalGraph,
  competeStrategies: competeCodeAISolutionStrategies,
  formatStrategyCompetition: formatCodeAISolutionStrategyCompetitionForObjective,
  isolatedCandidatePolicy: resolveCodeAIIsolatedCandidateCompetitionPolicy,
  reasoningBudget: resolveCodeAIAdaptiveReasoningBudget,
});

export default CodeAIWorldClassIntelligenceRuntime;
