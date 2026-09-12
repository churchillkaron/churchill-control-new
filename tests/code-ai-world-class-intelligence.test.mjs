import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  deriveCodeAICausalGraph,
  competeCodeAISolutionStrategies,
  resolveCodeAIAdaptiveReasoningBudget,
  prepareCodeAIWorldClassMission,
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
