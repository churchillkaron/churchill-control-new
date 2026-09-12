import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  deriveCodeAICausalGraph,
  competeCodeAISolutionStrategies,
  resolveCodeAIAdaptiveReasoningBudget,
  prepareCodeAIWorldClassMission,
  finalizeCodeAIWorldClassMission,
  formatCodeAISolutionStrategyCompetitionForObjective,
} from "../lib/code/runtime/CodeAIWorldClassIntelligenceRuntime.js";

test("world-class controller covers all ten intelligence layers without mutation authority", () => {
  const prepared = prepareCodeAIWorldClassMission({
    objective: "Improve architecture performance and reliability without weakening governance.",
    objective_context: {
      runtime_evidence: [{ kind: "trace", summary: "request fanout observed" }],
      negative_engineering_memory: ["Do not bypass verification"],
      failed_capability_key: "finance.customer_invoice.create",
    },
    resume_state: {
      repository_impact: { risk: "high" },
      files_changed: ["lib/a.js"],
      declared_evidence_reads: [{ result: { file_path: "lib/b.js" } }],
      failures: [{ message: "first attempt duplicated state" }],
      verification: [{ passed: false }],
      parallel_specialist_review: {
        reviews: [
          {
            success: true,
            role: "architecture_performance",
            recommendation: "Reuse the canonical lifecycle boundary and batch duplicate work.",
            alternative: "Add a local workaround in the caller.",
            confidence: 0.9,
            risks: ["compatibility"],
            verification: ["targeted test", "behavioral replay"],
          },
        ],
      },
    },
  });

  const control = prepared.control;
  assert.equal(control.code_studio_business_partner_convergence, true);
  assert.equal(control.runtime_evidence_loop_enabled, true);
  assert.equal(control.measured_intelligence_scoreboard_enabled, true);
  assert.equal(control.mutation_authority, false);
  assert.equal(control.commit_authority, false);
  assert.equal(control.deploy_authority, false);
  assert.ok(control.solution_strategy_competition.candidate_count >= 2);
  assert.ok(control.causal_graph.node_count >= 2);
  assert.ok(control.adaptive_reasoning_budget.recommended_reasoning_calls >= 1);
  assert.ok(control.negative_engineering_memory.length >= 1);
  assert.equal(control.cross_domain_business_recovery.active, true);
  assert.match(prepared.options.objective, /AVANTIQO WORLD-CLASS ENGINEERING CONTROL V1/);
});

test("strategy competition is deterministic and adds no reasoning calls", () => {
  const result = competeCodeAISolutionStrategies({
    repository_impact: { risk: "high" },
    runtime_evidence: [{ kind: "metric" }],
    specialist_review: {
      reviews: [
        {
          success: true,
          role: "architecture_performance",
          recommendation: "Fix the root cause in the existing canonical runtime with runtime verification.",
          alternative: "Create a duplicate compatibility layer.",
          confidence: 0.95,
          verification: ["runtime trace", "tests"],
          risks: [],
        },
      ],
    },
  });
  assert.equal(result.additional_reasoning_calls, 0);
  assert.equal(result.source_mutation_authority, false);
  assert.match(result.selected.direction, /root cause|canonical/i);
  assert.ok(result.selected.score >= result.strongest_rejected.score);
});

test("causal graph and adaptive budget stay bounded", () => {
  const graph = deriveCodeAICausalGraph({
    files_changed: ["lib/a.js"],
    evidence: [
      { result: { file_path: "lib/b.js" } },
      { result: { file_path: "lib/c.js" } },
    ],
  });
  assert.equal(graph.authorization_effect, "NONE");
  assert.ok(graph.edge_count <= 120);

  const budget = resolveCodeAIAdaptiveReasoningBudget({
    objective: "Security architecture migration with concurrency risk",
    state: { failures: [{}, {}, {}] },
    repository_impact: { risk: "critical" },
    strategy_competition: { selection_margin: 2 },
  });
  assert.ok(budget.recommended_reasoning_calls <= 8);
  assert.ok(budget.recommended_reasoning_calls >= 6);
  assert.equal(budget.deterministic_evidence_should_resolve_first, true);
});

test("canonical Code employee applies world-class intelligence for both Code Studio and Business Partner", async () => {
  const canonical = await readFile(
    "lib/code/runtime/CodeAIEmployeeCanonicalExecutionRuntime.js",
    "utf8",
  );
  const capability = await readFile(
    "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
    "utf8",
  );
  const healing = await readFile(
    "lib/platform/self-healing/PlatformSelfHealingCodeExecutionRuntime.js",
    "utf8",
  );
  assert.match(canonical, /prepareCodeAIWorldClassMission/);
  assert.match(canonical, /world_class_intelligence/);
  assert.match(capability, /executeCanonicalCodeAIEmployeeMission/);
  assert.match(healing, /executeCanonicalCodeAIEmployeeMission/);
});


test("specialist strategy competition is formatted into the implementation objective", async () => {
  const strategic = await readFile(
    "lib/code/runtime/CodeAIStrategicReasoningRuntime.js",
    "utf8",
  );
  assert.match(strategic, /const solutionStrategyCompetition = competeCodeAISolutionStrategies/);
  assert.match(strategic, /solution_strategy_competition: solutionStrategyCompetition/);
  assert.match(strategic, /formatCodeAISolutionStrategyCompetitionForObjective/);

  const competition = competeCodeAISolutionStrategies({
    repository_impact: { risk: "high" },
    specialist_review: {
      reviews: [{
        success: true,
        role: "architecture_performance",
        recommendation: "Reuse the canonical queue settlement boundary and verify runtime behavior.",
        alternative: "Patch one caller with a duplicate timeout workaround.",
        confidence: 0.94,
        verification: ["queue test", "runtime replay"],
        risks: [],
      }],
    },
  });
  const formatted = formatCodeAISolutionStrategyCompetitionForObjective(competition);
  assert.match(formatted, /Selected direction:/);
  assert.match(formatted, /canonical/i);
  assert.match(formatted, /Strongest rejected alternative:/);
});

test("world-class finalizer scores the completed mission rather than only mission start", () => {
  const prepared = prepareCodeAIWorldClassMission({
    objective: "Repair the runtime",
    resume_state: { repository_impact: { risk: "standard" } },
  });
  const finalized = finalizeCodeAIWorldClassMission({
    prepared_control: prepared.control,
    result: {
      state: {
        files_changed: ["lib/runtime.js"],
        tests: [{ exit_code: 0 }],
        verification: [{ passed: true }],
        repairs: [{ action: "apply_files" }],
        failures: [],
        solution_strategy_competition: {
          contract: "AVANTIQO_CODE_AI_SOLUTION_STRATEGY_COMPETITION_V1",
          candidate_count: 2,
          selected: { direction: "canonical repair" },
          strongest_rejected: { direction: "caller workaround" },
          selection_margin: 10,
        },
      },
    },
    options: prepared.options,
  });
  assert.equal(finalized.finalized_from_execution_result, true);
  assert.equal(finalized.benchmark_scorecard.tests_observed, 1);
  assert.equal(finalized.benchmark_scorecard.verification_passed, 1);
  assert.equal(finalized.benchmark_scorecard.first_pass_success, false);
  assert.equal(finalized.benchmark_scorecard.repair_count, 1);
  assert.equal(finalized.solution_strategy_competition.candidate_count, 2);
});

test("causal graph resolves observed static imports and reverse consumers", () => {
  const graph = deriveCodeAICausalGraph({
    files_changed: ["lib/core/runtime.js"],
    source_changes: [{
      path: "lib/core/runtime.js",
      operation: "write",
      content: "export function run() { return true; }\n",
    }],
    evidence: [
      {
        action: "read",
        result: {
          file_path: "lib/consumer/service.js",
          content: 'import { run } from "../core/runtime.js";\nexport const value = run();\n',
        },
      },
      {
        action: "read",
        result: {
          file_path: "tests/runtime.test.mjs",
          content: 'import { run } from "../lib/core/runtime.js";\n',
        },
      },
    ],
  });

  assert.equal(graph.bounded_static_dependency_analysis, true);
  assert.equal(graph.authoritative_dependency_parser, false);
  assert.ok(graph.static_import_edges_observed >= 2);
  assert.ok(graph.edges.some((edge) =>
    edge.from === "lib/consumer/service.js" &&
    edge.to === "lib/core/runtime.js" &&
    edge.relation === "static_relative_import"
  ));
  const changed = graph.changed_path_consumers.find((entry) => entry.path === "lib/core/runtime.js");
  assert.ok(changed);
  assert.ok(changed.observed_consumers.includes("lib/consumer/service.js"));
  assert.ok(changed.observed_consumers.includes("tests/runtime.test.mjs"));
  assert.equal(graph.incomplete_evidence_must_not_be_treated_as_no_dependency, true);
});

test("verified prior mission lessons become durable negative engineering memory", async () => {
  const history = await readFile("lib/code/runtime/CodeAIMissionHistoryRuntime.js", "utf8");
  const memory = await readFile("lib/code/runtime/CodeAIVerifiedEngineeringMemoryRuntime.js", "utf8");
  assert.match(history, /safeStrategyDecision/);
  assert.match(history, /strategy_decision: safeStrategyDecision\(state\)/);
  assert.match(history, /rejected_direction/);
  assert.match(memory, /negative_engineering_lessons/);
  assert.match(memory, /Previously rejected strategy:/);
  assert.match(memory, /Previously observed failure:/);

  const prepared = prepareCodeAIWorldClassMission({
    objective: "Repair the queue runtime using verified engineering history.",
    resume_state: {
      verified_engineering_memory: {
        matches: [{
          negative_engineering_lessons: [
            "Previously rejected strategy: duplicate timeout in every caller",
            "Previously observed failure: queue settlement raced cancellation",
          ],
        }],
      },
    },
  });
  assert.ok(prepared.control.negative_engineering_memory.some((item) =>
    item.includes("duplicate timeout")
  ));
  assert.match(prepared.options.objective, /KNOWN FAILED\/NEGATIVE APPROACHES/);
  assert.match(prepared.options.objective, /queue settlement raced cancellation/);
});

test("adaptive reasoning budgets can escalate after strategic evidence while caller budgets remain fixed", async () => {
  const automatic = prepareCodeAIWorldClassMission({
    objective: "Repair a bounded runtime defect.",
    resume_state: { repository_impact: { risk: "standard" } },
  });
  assert.equal(automatic.options.objective_context.adaptive_reasoning_budget_applied, true);
  assert.equal(automatic.options.objective_context.caller_reasoning_budget_preserved, false);

  const explicit = prepareCodeAIWorldClassMission({
    objective: "Repair a bounded runtime defect.",
    reasoning_call_budget: 3,
    resume_state: { repository_impact: { risk: "critical" } },
  });
  assert.equal(explicit.options.reasoning_call_budget, 3);
  assert.equal(explicit.options.objective_context.adaptive_reasoning_budget_applied, false);
  assert.equal(explicit.options.objective_context.caller_reasoning_budget_preserved, true);

  const live = await readFile("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8");
  const strategic = await readFile("lib/code/runtime/CodeAIStrategicReasoningRuntime.js", "utf8");
  assert.match(live, /adaptiveBudgetApplied[\s\S]*Math\.max\(existingBudget \|\| 0, incomingBudget\)/);
  assert.match(live, /workPackageControl\(state, reasoning_call_budget, objectiveContext\)/);
  assert.match(strategic, /const effectiveReasoningBudget = adaptiveBudgetMayEscalate[\s\S]*Math\.max/);
  assert.match(strategic, /effective_reasoning_call_budget/);
  assert.match(strategic, /caller_reasoning_budget_preserved/);
});

test("causal graph observes imported symbol calls and alias consumers without claiming compiler authority", () => {
  const graph = deriveCodeAICausalGraph({
    files_changed: ["lib/core/runtime.js"],
    source_changes: [{
      path: "lib/core/runtime.js",
      operation: "write",
      content: [
        "export function runMission() { return true; }",
        "export default function createRuntime() { return {}; }",
        "export const helper = () => true;",
      ].join("\n"),
    }],
    evidence: [
      {
        action: "read",
        result: {
          file_path: "lib/consumer/service.js",
          content: [
            'import createRuntime, { runMission as invokeMission, helper } from "../core/runtime.js";',
            "invokeMission();",
            "helper();",
            "createRuntime();",
          ].join("\n"),
        },
      },
      {
        action: "read",
        result: {
          file_path: "lib/consumer/namespace.js",
          content: [
            'import * as runtime from "../core/runtime.js";',
            "runtime.runMission();",
          ].join("\n"),
        },
      },
    ],
  });

  assert.equal(graph.authoritative_call_graph, false);
  assert.equal(graph.bounded_symbol_call_analysis, true);
  assert.ok(graph.imported_symbol_call_edges_observed >= 4);
  assert.ok(graph.edges.some((edge) =>
    edge.relation === "calls_imported_symbol" &&
    edge.from === "lib/consumer/service.js" &&
    edge.to === "lib/core/runtime.js" &&
    edge.local_binding === "invokeMission" &&
    edge.target_symbol === "runMission" &&
    edge.target_export_observed === true
  ));
  assert.ok(graph.edges.some((edge) =>
    edge.relation === "calls_imported_symbol" &&
    edge.local_binding === "createRuntime" &&
    edge.target_symbol === "default" &&
    edge.target_export_observed === true
  ));
  assert.ok(graph.edges.some((edge) =>
    edge.relation === "calls_imported_symbol" &&
    edge.local_binding === "runtime.runMission" &&
    edge.target_symbol === "runMission"
  ));

  const changed = graph.changed_path_consumers.find((entry) => entry.path === "lib/core/runtime.js");
  assert.ok(changed);
  assert.ok(changed.observed_exports.includes("runMission"));
  assert.ok(changed.observed_exports.includes("default"));
  assert.ok(changed.observed_symbol_calls.some((call) =>
    call.caller === "lib/consumer/service.js" && call.target_symbol === "runMission"
  ));
  assert.equal(graph.incomplete_evidence_must_not_be_treated_as_no_dependency, true);
});

test("causal graph keeps symbol-call analysis bounded", () => {
  const calls = Array.from({ length: 120 }, (_, index) => `run${index % 10}();`).join("\n");
  const imports = Array.from({ length: 10 }, (_, index) => `run${index}`).join(", ");
  const exports = Array.from({ length: 10 }, (_, index) => `export function run${index}(){ return ${index}; }`).join("\n");
  const graph = deriveCodeAICausalGraph({
    files_changed: ["lib/core/many.js"],
    source_changes: [{ path: "lib/core/many.js", operation: "write", content: exports }],
    evidence: [{
      action: "read",
      result: {
        file_path: "lib/consumer/many.js",
        content: `import { ${imports} } from "../core/many.js";\n${calls}`,
      },
    }],
  });
  assert.ok(graph.imported_symbol_call_edges_observed <= 80);
  assert.ok(graph.edge_count <= 200);
  assert.equal(graph.authoritative_call_graph, false);
});
