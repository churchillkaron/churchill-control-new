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

function sourceEvidenceDocuments(state = {}) {
  const documents = new Map();
  for (const entry of [
    ...list(state?.declared_evidence_reads),
    ...list(state?.evidence),
  ]) {
    if (text(entry?.action, 80) !== "read") continue;
    const result = object(entry?.result);
    const filePath = text(result.file_path || result.path, 1200);
    const content = String(result.content ?? "");
    if (filePath && content) documents.set(filePath, content.slice(0, 30000));
  }
  for (const entry of list(state?.source_changes)) {
    if (text(entry?.operation, 40).toLowerCase() === "delete") continue;
    const filePath = text(entry?.path, 1200);
    const content = String(entry?.content ?? "");
    if (filePath && content) documents.set(filePath, content.slice(0, 30000));
  }
  return documents;
}

function relativeImportSpecifiers(content) {
  const matches = [];
  const source = String(content ?? "");
  const patterns = [
    /(?:import|export)\s+(?:[^"']+?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g,
    /require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
    /import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) matches.push(match[1]);
      if (matches.length >= 80) return unique(matches);
    }
  }
  return unique(matches);
}

function normalizePathSegments(value) {
  const stack = [];
  for (const segment of text(value, 2000).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return stack.join("/");
}

function directoryOf(filePath) {
  const parts = text(filePath, 1200).split("/");
  parts.pop();
  return parts.join("/");
}

function resolveObservedImport(fromPath, specifier, observedPaths) {
  const base = normalizePathSegments(`${directoryOf(fromPath)}/${specifier}`);
  const candidates = [
    base,
    `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.cjs`,
    `${base}/index.js`, `${base}/index.jsx`, `${base}/index.ts`, `${base}/index.tsx`,
    `${base}/index.mjs`, `${base}/index.cjs`,
  ];
  return candidates.find((candidate) => observedPaths.has(candidate)) || null;
}


function exportedSymbols(content) {
  const source = String(content ?? "");
  const symbols = [];
  const declarationPatterns = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const pattern of declarationPatterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) symbols.push(match[1]);
      if (symbols.length >= 80) return unique(symbols);
    }
  }
  for (const match of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const raw of String(match[1] || "").split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const alias = part.match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (alias) symbols.push(alias[2] || alias[1]);
      if (symbols.length >= 80) return unique(symbols);
    }
  }
  if (/\bexport\s+default\b/.test(source)) symbols.push("default");
  return unique(symbols);
}

function importBindings(content) {
  const source = String(content ?? "");
  const bindings = [];
  for (const match of source.matchAll(/\bimport\s+([^;\n]+?)\s+from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const clause = String(match[1] || "").trim();
    const specifier = String(match[2] || "").trim();
    if (!clause || !specifier) continue;

    const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespace) {
      bindings.push({ kind: "namespace", imported: "*", local: namespace[1], specifier });
    }

    const named = clause.match(/\{([^}]+)\}/);
    if (named) {
      for (const raw of String(named[1] || "").split(",")) {
        const part = raw.trim().replace(/^type\s+/, "");
        if (!part) continue;
        const parsed = part.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (parsed) {
          bindings.push({
            kind: "named",
            imported: parsed[1],
            local: parsed[2] || parsed[1],
            specifier,
          });
        }
      }
    }

    const beforeNamed = clause.split("{")[0].split("*")[0].trim().replace(/,$/, "").trim();
    if (beforeNamed && /^[A-Za-z_$][\w$]*$/.test(beforeNamed)) {
      bindings.push({ kind: "default", imported: "default", local: beforeNamed, specifier });
    }
    if (bindings.length >= 100) break;
  }
  return bindings.slice(0, 100);
}

function escapedRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function importedSymbolCalls(content, binding) {
  const source = String(content ?? "");
  const calls = [];
  if (binding.kind === "namespace") {
    const pattern = new RegExp(`\\b${escapedRegExp(binding.local)}\\.([A-Za-z_$][\\w$]*)\\s*\\(`, "g");
    for (const match of source.matchAll(pattern)) {
      calls.push({ local: `${binding.local}.${match[1]}`, target_symbol: match[1] });
      if (calls.length >= 30) break;
    }
    return calls;
  }
  const pattern = new RegExp(`\\b(?:new\\s+)?${escapedRegExp(binding.local)}\\s*\\(`, "g");
  for (const _match of source.matchAll(pattern)) {
    calls.push({ local: binding.local, target_symbol: binding.imported });
    if (calls.length >= 30) break;
  }
  return calls;
}

export function deriveCodeAICausalGraph(state = {}) {
  const source = object(state);
  const paths = pathEvidence(source);
  const changed = new Set(unique([
    ...list(source.files_changed),
    ...list(source.source_changes).map((entry) => entry?.path),
  ]));
  const documents = sourceEvidenceDocuments(source);
  const observedPaths = new Set(unique([...paths, ...documents.keys()]));
  const nodes = [...observedPaths].slice(0, 100).map((path) => ({
    id: path,
    kind: changed.has(path) ? "changed" : "evidence",
    source_content_observed: documents.has(path),
  }));
  const boundedNodePaths = new Set(nodes.map((node) => node.id));
  const edges = [];
  const seenEdges = new Set();
  const exportsByPath = new Map(
    [...documents.entries()].map(([filePath, content]) => [filePath, new Set(exportedSymbols(content))]),
  );
  let staticImportEdgeCount = 0;
  let symbolCallEdgeCount = 0;
  for (const [fromPath, content] of documents.entries()) {
    if (!boundedNodePaths.has(fromPath)) continue;
    for (const specifier of relativeImportSpecifiers(content)) {
      const resolved = resolveObservedImport(fromPath, specifier, boundedNodePaths);
      if (!resolved) continue;
      const key = `import:${fromPath}->${resolved}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({
        from: fromPath,
        to: resolved,
        relation: "static_relative_import",
        evidence: specifier,
      });
      staticImportEdgeCount += 1;
      if (edges.length >= 200) break;
    }
    if (edges.length >= 200) break;

    for (const binding of importBindings(content)) {
      const resolved = resolveObservedImport(fromPath, binding.specifier, boundedNodePaths);
      if (!resolved) continue;
      for (const call of importedSymbolCalls(content, binding)) {
        const targetSymbol = text(call.target_symbol, 240);
        const key = `call:${fromPath}->${resolved}:${targetSymbol}:${call.local}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        const observedExports = exportsByPath.get(resolved) || new Set();
        edges.push({
          from: fromPath,
          to: resolved,
          relation: "calls_imported_symbol",
          local_binding: text(call.local, 240),
          target_symbol: targetSymbol,
          import_kind: binding.kind,
          import_specifier: binding.specifier,
          target_export_observed:
            targetSymbol === "default" ? observedExports.has("default") : observedExports.has(targetSymbol),
          evidence: `${text(call.local, 240)}(`,
        });
        symbolCallEdgeCount += 1;
        if (symbolCallEdgeCount >= 80 || edges.length >= 200) break;
      }
      if (symbolCallEdgeCount >= 80 || edges.length >= 200) break;
    }
    if (symbolCallEdgeCount >= 80 || edges.length >= 200) break;
  }
  const consumersByPath = new Map();
  for (const edge of edges) {
    const consumers = consumersByPath.get(edge.to) || [];
    consumers.push(edge.from);
    consumersByPath.set(edge.to, consumers);
  }
  const changedConsumers = [...changed]
    .filter((filePath) => boundedNodePaths.has(filePath))
    .map((filePath) => ({
      path: filePath,
      observed_consumers: unique(consumersByPath.get(filePath) || []).slice(0, 30),
      observed_symbol_calls: edges
        .filter((edge) => edge.to === filePath && edge.relation === "calls_imported_symbol")
        .slice(0, 30)
        .map((edge) => ({
          caller: edge.from,
          local_binding: edge.local_binding,
          target_symbol: edge.target_symbol,
          target_export_observed: edge.target_export_observed === true,
        })),
      observed_exports: [...(exportsByPath.get(filePath) || [])].slice(0, 40),
    }));
  const unresolvedRelativeImportCount = [...documents.entries()]
    .reduce((count, [fromPath, content]) => count + relativeImportSpecifiers(content)
      .filter((specifier) => !resolveObservedImport(fromPath, specifier, boundedNodePaths)).length, 0);
  return {
    contract: "AVANTIQO_CODE_AI_CAUSAL_GRAPH_V1",
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
    changed_path_consumers: changedConsumers,
    static_import_edges_observed: staticImportEdgeCount,
    imported_symbol_call_edges_observed: symbolCallEdgeCount,
    unresolved_relative_import_count: unresolvedRelativeImportCount,
    source_documents_observed: documents.size,
    authoritative_dependency_parser: false,
    authoritative_call_graph: false,
    bounded_static_dependency_analysis: true,
    bounded_symbol_call_analysis: true,
    incomplete_evidence_must_not_be_treated_as_no_dependency: true,
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
  const verifiedMemoryLessons = list(source?.verified_engineering_memory?.matches)
    .flatMap((match) => list(match?.negative_engineering_lessons));
  return unique([
    ...list(source.negative_engineering_memory),
    ...list(context.negative_engineering_memory),
    ...verifiedMemoryLessons,
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
  const causalGraph = deriveCodeAICausalGraph(source);
  const tests = list(source.tests);
  const verification = list(source.verification);
  const passed = verification.filter((entry) => entry?.passed === true).length;
  const failed = verification.filter((entry) => entry?.passed === false).length;
  const failures = list(source.failures).length;
  const repairs = list(source.repairs).length;
  const reasoningCallsUsed = Number(source?.work_package_control?.reasoning_calls_used || 0);
  const isolatedCandidateUsed = source?.isolated_candidate_competition?.executed === true;
  const controllerRetries = list(source.evidence).filter((entry) =>
    text(entry?.kind, 120) === "employee_controller" ||
    (text(entry?.kind, 120) === "final_independent_review_controller" &&
      text(entry?.status, 120) === "repair_required")
  ).length;
  return {
    contract: "AVANTIQO_CODE_AI_ENGINEERING_SCOREBOARD_V1",
    tests_observed: tests.length,
    verification_passed: passed,
    verification_failed: failed,
    repair_count: repairs,
    failure_count: failures,
    first_pass_success:
      failures === 0 &&
      repairs === 0 &&
      controllerRetries === 0 &&
      passed > 0 &&
      reasoningCallsUsed <= 1 &&
      !isolatedCandidateUsed,
    candidate_assisted_completion: isolatedCandidateUsed && passed > 0,
    controller_retry_count: controllerRetries,
    human_intervention_count: Number(source?.owner_intervention?.revision || 0),
    reasoning_calls_used: reasoningCallsUsed,
    observed_static_import_edges: Number(causalGraph.static_import_edges_observed || 0),
    observed_imported_symbol_call_edges:
      Number(causalGraph.imported_symbol_call_edges_observed || 0),
    changed_modules_with_observed_symbol_callers:
      list(causalGraph.changed_path_consumers)
        .filter((entry) => list(entry?.observed_symbol_calls).length > 0).length,
    caller_awareness_evidence_present:
      Number(causalGraph.imported_symbol_call_edges_observed || 0) > 0,
    score: Math.max(0, Math.min(100,
      70 +
      passed * 5 -
      failed * 12 -
      failures * 4 -
      Math.min(10, repairs * 2) -
      Math.min(12, controllerRetries * 3)
    )),
  };
}

function hotspotPriorityWeight(priority) {
  return priority === "P0" ? 3 : priority === "P1" ? 2 : 1;
}

export function deriveCodeAIEngineeringHotspots({ causalGraph = {}, scoreboard = {}, negative = [] } = {}) {
  const graph = object(causalGraph);
  const score = object(scoreboard);
  const lessons = list(negative);
  const items = [];
  const push = (priority, area, severityScore, evidence, recommendation, paths = []) => {
    items.push({
      priority,
      area,
      score: Math.max(0, Math.min(100, Number(severityScore || 0))),
      evidence: text(evidence, 1200),
      recommendation: text(recommendation, 1200),
      affected_paths: unique(paths).slice(0, 12),
      authorization_effect: "NONE",
    });
  };

  const consumers = list(graph.changed_path_consumers);
  const fanout = consumers
    .map((entry) => ({
      path: text(entry?.path, 1000),
      consumer_count: list(entry?.observed_consumers).length,
      symbol_caller_count: list(entry?.observed_symbol_calls).length,
    }))
    .filter((entry) => entry.path)
    .sort((a, b) =>
      (b.consumer_count + b.symbol_caller_count) - (a.consumer_count + a.symbol_caller_count) ||
      a.path.localeCompare(b.path)
    );
  const hottest = fanout[0] || null;
  const hottestFanout = hottest ? hottest.consumer_count + hottest.symbol_caller_count : 0;
  if (hottestFanout >= 4) {
    push(
      hottestFanout >= 8 ? "P0" : "P1",
      "caller_fanout",
      55 + Math.min(40, hottestFanout * 5),
      `${hottest.path} has ${hottest.consumer_count} observed consumers and ${hottest.symbol_caller_count} observed symbol callers.`,
      "Review this shared boundary for compatibility, duplication and avoidable fanout before adding more caller-specific behavior.",
      [hottest.path, ...list(consumers.find((entry) => text(entry?.path, 1000) === hottest.path)?.observed_consumers)],
    );
  }

  const unresolved = Number(graph.unresolved_relative_import_count || 0);
  if (unresolved > 0) {
    push(
      unresolved >= 4 ? "P1" : "P2",
      "dependency_uncertainty",
      45 + Math.min(35, unresolved * 8),
      `${unresolved} relative import edge${unresolved === 1 ? " is" : "s are"} unresolved in the bounded dependency graph.`,
      "Resolve dependency uncertainty before making broad architectural conclusions or expanding blast radius.",
    );
  }

  const failedVerification = Number(score.verification_failed || 0);
  if (failedVerification > 0) {
    push(
      "P0",
      "verification_failure",
      100,
      `${failedVerification} verification check${failedVerification === 1 ? " has" : "s have"} failed in the mission evidence.`,
      "Turn the failing verifier into a deterministic prevention rule or preflight once the root cause is confirmed.",
    );
  }

  const repairCycles = Number(score.repair_count || 0) + Number(score.controller_retry_count || 0);
  if (repairCycles >= 2) {
    push(
      repairCycles >= 4 ? "P0" : "P1",
      "convergence_debt",
      55 + Math.min(40, repairCycles * 8),
      `${Number(score.repair_count || 0)} repair cycles and ${Number(score.controller_retry_count || 0)} controller retries were observed.`,
      "Identify the earliest missing evidence or preflight that would have prevented repeated repair/review loops.",
    );
  }

  if (score.candidate_assisted_completion === true) {
    push(
      "P2",
      "strategy_ambiguity",
      48,
      "Verified completion required isolated candidate competition.",
      "Capture what distinguished the winning candidate so future strategy selection can converge without implementation competition when evidence is equivalent.",
    );
  }

  if (lessons.length >= 4) {
    push(
      "P2",
      "negative_memory_guardrail",
      40 + Math.min(30, lessons.length * 4),
      `${lessons.length} negative engineering lessons or rejected approaches are active.`,
      "Promote repeated failure patterns into deterministic guardrails, preflights or reusable engineering skills when the evidence repeats across missions.",
    );
  }

  if (Number(graph.node_count || 0) > 18 && Number(graph.static_import_edges_observed || 0) > 24) {
    push(
      "P2",
      "cross_surface_coupling",
      50 + Math.min(25, Math.round(Number(graph.static_import_edges_observed || 0) / 4)),
      `${Number(graph.node_count || 0)} observed nodes and ${Number(graph.static_import_edges_observed || 0)} static import edges are in scope.`,
      "Check whether repeated cross-surface coupling belongs behind an existing canonical lifecycle or service boundary.",
      list(graph.nodes).map((entry) => typeof entry === "string" ? entry : entry?.path).filter(Boolean).slice(0, 12),
    );
  }

  const priorityRank = { P0: 0, P1: 1, P2: 2 };
  const ranked = items.sort((a, b) =>
    priorityRank[a.priority] - priorityRank[b.priority] ||
    b.score - a.score ||
    a.area.localeCompare(b.area)
  ).slice(0, 8);
  return {
    contract: "AVANTIQO_CODE_AI_ENGINEERING_HOTSPOT_PROJECTION_V1",
    hotspot_count: ranked.length,
    highest_priority: ranked[0]?.priority || null,
    weighted_severity: ranked.reduce((sum, item) => sum + hotspotPriorityWeight(item.priority) * item.score, 0),
    items: ranked,
    evidence_backed: ranked.length > 0,
    automatic_source_mutation_authority: false,
    commit_authority: false,
    deploy_authority: false,
    authorization_effect: "NONE",
  };
}

function proactiveDiscovery({ causalGraph, scoreboard, negative }) {
  const hotspots = deriveCodeAIEngineeringHotspots({ causalGraph, scoreboard, negative });
  return hotspots.items
    .map((item) => `[${item.priority}] ${item.recommendation} Evidence: ${item.evidence}`)
    .slice(0, 6);
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

function causalCallerRelationships(causalGraph = {}) {
  return list(causalGraph?.changed_path_consumers)
    .flatMap((entry) => list(entry?.observed_symbol_calls).map((call) => ({
      changed_path: text(entry?.path, 1000),
      caller: text(call?.caller, 1000),
      target_symbol: text(call?.target_symbol, 240),
      local_binding: text(call?.local_binding, 240),
      target_export_observed: call?.target_export_observed === true,
    })))
    .filter((item) => item.changed_path && item.caller && item.target_symbol)
    .slice(0, 12);
}

function formatWorldClassDirective(control) {
  const selected = text(control?.solution_strategy_competition?.selected?.direction, 1600);
  const rejected = text(control?.solution_strategy_competition?.strongest_rejected?.direction, 1200);
  const negative = list(control?.negative_engineering_memory).slice(-6);
  const proactive = list(control?.proactive_improvement_opportunities).slice(0, 4);
  const callerRelationships = causalCallerRelationships(control?.causal_graph);
  return [
    "AVANTIQO WORLD-CLASS ENGINEERING CONTROL V1",
    selected ? `SELECTED STRATEGY: ${selected}` : null,
    rejected ? `STRONGEST REJECTED ALTERNATIVE: ${rejected}` : null,
    `ADAPTIVE REASONING BUDGET: ${Number(control?.adaptive_reasoning_budget?.recommended_reasoning_calls || 0)} calls maximum unless deterministic evidence closes the task earlier.`,
    `CAUSAL GRAPH: ${Number(control?.causal_graph?.node_count || 0)} nodes / ${Number(control?.causal_graph?.static_import_edges_observed || 0)} observed static import edges / ${Number(control?.causal_graph?.imported_symbol_call_edges_observed || 0)} observed imported-symbol call edges; unresolved relative imports=${Number(control?.causal_graph?.unresolved_relative_import_count || 0)}. Treat missing edges as unknown when source evidence is incomplete.`,
    callerRelationships.length
      ? `OBSERVED CALLER COMPATIBILITY OBLIGATIONS: ${callerRelationships.map((item) => `${item.caller} -> ${item.changed_path}#${item.target_symbol}${item.local_binding && item.local_binding !== item.target_symbol ? ` via ${item.local_binding}` : ""}`).join(" | ")}. Review these observed callers for compatibility and include their behavior in verification scope when repository evidence exposes a trustworthy verifier.`
      : null,
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
  const engineeringHotspots = deriveCodeAIEngineeringHotspots({ causalGraph, scoreboard, negative });
  const proactive = engineeringHotspots.items
    .map((item) => `[${item.priority}] ${item.recommendation} Evidence: ${item.evidence}`)
    .slice(0, 6);
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
    engineering_hotspots: engineeringHotspots,
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
  const explicitReasoningBudget = Number(options.reasoning_call_budget);
  const explicitReasoningBudgetProvided =
    Number.isInteger(explicitReasoningBudget) && explicitReasoningBudget > 0;
  return {
    options: {
      ...options,
      objective,
      objective_context: {
        ...objectiveContext,
        world_class_intelligence_contract: CODE_AI_WORLD_CLASS_INTELLIGENCE_CONTRACT,
        adaptive_reasoning_budget: budget.recommended_reasoning_calls,
        adaptive_reasoning_budget_applied: !explicitReasoningBudgetProvided,
        caller_reasoning_budget_preserved: explicitReasoningBudgetProvided,
        runtime_evidence_count: runtime.length,
        cross_domain_business_recovery: recovery.active,
      },
      reasoning_call_budget: explicitReasoningBudgetProvided
        ? explicitReasoningBudget
        : budget.recommended_reasoning_calls,
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
  const engineeringHotspots = deriveCodeAIEngineeringHotspots({ causalGraph, scoreboard, negative });
  const proactive = engineeringHotspots.items
    .map((item) => `[${item.priority}] ${item.recommendation} Evidence: ${item.evidence}`)
    .slice(0, 6);
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
    engineering_hotspots: engineeringHotspots,
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
  engineeringHotspots: deriveCodeAIEngineeringHotspots,
});

export default CodeAIWorldClassIntelligenceRuntime;
