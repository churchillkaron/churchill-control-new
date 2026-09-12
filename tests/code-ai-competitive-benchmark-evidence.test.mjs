import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

const {
  projectCodeAICompetitiveBenchmarkEvidence,
  refreshCodeAICompetitiveBenchmarkEvidenceFreshness,
} = await import("../lib/code/runtime/CodeAICompetitiveBenchmarkEvidenceRuntime.js");

function comparison(provider, model, lossCase) {
  return {
    reference: { provider, model },
    measured_at: new Date().toISOString(),
    case_count: 20,
    wins: 12,
    losses: 4,
    ties: 4,
    win_rate: 0.75,
    owned_pass_rate: 1,
    reference_pass_rate: 1,
    p95_latency_ratio: 0.9,
    cost_ratio: 0.8,
    reference_age_days: 1,
    gates: {
      canonical_suite_exact: true,
      minimum_case_count: true,
      owned_pass_rate_not_worse: true,
      owned_win_rate: true,
      reference_fresh: true,
      p95_latency_competitive: true,
      cost_competitive: true,
    },
    passed: true,
    cases: [
      { case_id: lossCase, outcome: "LOSS" },
      { case_id: `${lossCase}-win`, outcome: "WIN" },
    ],
  };
}

function report(generatedAt = new Date().toISOString()) {
  return {
    contract: "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1",
    generated_at: generatedAt,
    suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
    suite_case_count: 20,
    competitive_certified: true,
    superiority_claim_allowed: true,
    comparisons: [
      comparison("reference-a", "model-a", "architecture-01"),
      comparison("reference-b", "model-b", "runtime-02"),
    ],
  };
}

const backlog = {
  contract: "AVANTIQO_CODE_COMPETITIVE_IMPROVEMENT_BACKLOG_V1",
  items: [{
    case_id: "architecture-01",
    category: "architecture",
    title: "Choose the safer repository-wide architecture under ambiguity",
    required_evidence: ["tests", "runtime evidence"],
    losses: 2,
    references: ["reference-a/model-a", "reference-b/model-b"],
  }],
};

test("competitive evidence is current and superiority remains fail-closed", () => {
  const evidence = projectCodeAICompetitiveBenchmarkEvidence({ report: report(), backlog });
  assert.equal(evidence.competitive_certified, true);
  assert.equal(evidence.evidence_current, true);
  assert.equal(evidence.superiority_claim_allowed, true);
  assert.equal(evidence.comparisons.length, 2);
  assert.deepEqual(evidence.comparisons[0].loss_case_ids, ["architecture-01"]);
  assert.equal(evidence.improvement_backlog.length, 1);
  assert.equal(evidence.provider_routing_authority, false);
  assert.equal(evidence.production_deploy_authority, false);
  assert.equal(evidence.customer_private_content_included, false);
  assert.equal(evidence.raw_reasoning_included, false);

  const staleAt = new Date(Date.now() - 45 * 86400000).toISOString();
  const stale = projectCodeAICompetitiveBenchmarkEvidence({ report: report(staleAt), backlog });
  assert.equal(stale.competitive_certified, true);
  assert.equal(stale.evidence_current, false);
  assert.equal(stale.superiority_claim_allowed, false);

  const current = projectCodeAICompetitiveBenchmarkEvidence({ report: report(), backlog });
  const future = refreshCodeAICompetitiveBenchmarkEvidenceFreshness(current, {
    now_ms: Date.parse(current.generated_at) + 31 * 86400000,
  });
  assert.equal(future.competitive_certified, true);
  assert.equal(future.evidence_current, false);
  assert.equal(future.superiority_claim_allowed, false);
  assert.equal(future.freshness_recomputed_at_read, true);
});

test("competitive benchmark evidence persists globally but remains advisory to current main", async () => {
  const runtime = await readFile("lib/code/runtime/CodeAICompetitiveBenchmarkEvidenceRuntime.js", "utf8");
  const benchmark = await readFile("lib/code/runtime/CodeAIEngineeringPerformanceBenchmarkRuntime.js", "utf8");
  const portfolio = await readFile("lib/platform/capabilities/createProductEngineeringPortfolioCapability.js", "utf8");
  const script = await readFile("scripts/persist-avantiqo-code-competitive-evidence-local.mjs", "utf8");
  const pkg = await readFile("package.json", "utf8");

  assert.match(runtime, /resolveAvantiqoLearningOrganization/);
  assert.match(runtime, /platform_code_competitive_benchmark_evidence/);
  assert.match(runtime, /ordinary_memory_recall: false/);
  assert.match(runtime, /provider_routing_authority: false/);
  assert.match(runtime, /refreshCodeAICompetitiveBenchmarkEvidenceFreshness/);
  assert.match(runtime, /freshness_recomputed_at_read/);
  assert.match(benchmark, /loadLatestCodeAICompetitiveBenchmarkEvidence/);
  assert.match(benchmark, /competitive_evidence: competitiveEvidence/);
  assert.match(portfolio, /GLOBAL CODE COMPETITIVE BENCHMARK EVIDENCE/);
  assert.match(portfolio, /source report is not repository-commit authoritative/);
  assert.match(portfolio, /current-main repository evidence supports a concrete improvement/);
  assert.match(script, /CODE_COMPETITIVE_EVIDENCE_CURRENT_MAIN_REQUIRED/);
  assert.match(script, /persistCodeAICompetitiveBenchmarkEvidence/);
  assert.match(pkg, /persist:code:competitive-evidence:local/);
});


test("shared Code history API and UI expose competitive evidence without making it authoritative", async () => {
  const route = await readFile("app/api/operator/code/history/route.js", "utf8");
  const panel = await readFile("components/operator/CodeMissionHistoryPanel.jsx", "utf8");

  assert.match(route, /loadLatestCodeAICompetitiveBenchmarkEvidence/);
  assert.match(route, /Promise\.all\(\[/);
  assert.match(route, /competitive_evidence: competitiveEvidence/);
  assert.match(route, /history_load_blocked: false/);
  assert.match(panel, /setCompetitiveEvidence/);
  assert.match(panel, /data-avantiqo-code-competitive-evidence="true"/);
  assert.match(panel, /Competitive evidence/);
  assert.match(panel, /benchmark certified/);
  assert.match(panel, /no superiority claim/);
  assert.match(panel, /Next competitive gap:/);
});
