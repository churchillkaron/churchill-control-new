import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  attestCodeAICompetitiveReferenceReport,
} from "../lib/code/runtime/CodeAICompetitiveReferenceAttestationRuntime.js";
import { attestCodeAICompetitiveOwnedReport } from "../lib/code/runtime/CodeAICompetitiveOwnedAttestationRuntime.js";

const SECRET = "competitive-reference-integration-secret-0123456789abcdef";
const SUITE_PATH = "benchmarks/avantiqo-code-frontier-engineering-suite.json";
const PROMPT_PATH = "benchmarks/avantiqo-code-frontier-prompt-contract.json";
const env = {
  AVANTIQO_CODE_COMPETITIVE_REFERENCE_ATTESTATION_SECRET: SECRET,
  AVANTIQO_CODE_COMPETITIVE_OWNED_ATTESTATION_SECRET: "owned-competitive-secret-0123456789abcdef",
};
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

function observations(caseIds, wallMs, { repositoryProof = true, qualityScore = 0.85, categoryByCase = {} } = {}) {
  return caseIds.map((case_id, index) => ({
    case_id,
    category: categoryByCase[case_id] || null,
    passed: true,
    quality_score: qualityScore,
    evidence_grounding_score: 0.9,
    narrative_grounding_score: 0.9,
    evidence_distinctness_score: 0.9,
    response_template_fingerprint_sha256: sha256(`template:${case_id}`),
    response_template_simhash64: sha256(`simhash:${case_id}`).slice(0, 16),
    evidence_key_count: 2,
    latency_measurement_source: "RUNNER_MONOTONIC_CLOCK_V1",
    wall_ms: wallMs + index,
    input_tokens: 100,
    output_tokens: 80,
    token_usage_source: "PROVIDER_API_USAGE_V1",
    pricing_input_usd_per_1m: 1,
    pricing_output_usd_per_1m: 5,
    pricing_source: "OPERATOR_APPROVED_REFERENCE_PRICING_V1",
    cost_measurement_source: "RUNNER_RECOMPUTED_FROM_USAGE_AND_PRICING_V1",
    supplier_cost_usd: 0.0005,
    ...(repositoryProof ? {
      base_commit: "1".repeat(40),
      diff_sha256: ((index + 2).toString(16).padStart(2, "0")).repeat(32),
      artifact_sha256: ((index + 40).toString(16).padStart(2, "0")).repeat(32),
      repository_mutation_observed: true,
      diff_nonempty: true,
      diff_bytes: 512,
      artifact_materialized: true,
      artifact_bytes: 1024,
      repository_verification: {
        case_id,
        independent: true,
        verifier: "hidden-node-test",
        evidence_source: "INDEPENDENT_RUNNER",
        passed: true,
        exit_code: 0,
        hidden_acceptance_sha256: ((index + 80).toString(16).padStart(2, "0")).repeat(32),
        hidden_acceptance_executed: true,
        hidden_acceptance_test_count: 4,
        protected_baseline_sha256: "5".repeat(64),
        protected_baseline_executed: true,
        protected_baseline_test_count: 12,
        candidate_self_report_authority: false,
      },
    } : {}),
  }));
}

function referenceReport({ provider, model, caseIds, suiteSha, promptSha, wallMs, qualityScore = 0.85, categoryByCase = {} }) {
  return {
    contract: "AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPORT_V1",
    generator_contract: "AVANTIQO_CODE_COMPETITIVE_REFERENCE_RUNNER_V1",
    benchmark_run_id: provider === "openai"
      ? "33333333-3333-4333-8333-333333333333"
      : "44444444-4444-4444-8444-444444444444",
    generated_at: new Date().toISOString(),
    measurement_mode: "LIVE_REFERENCE_PROVIDER",
    provider_execution_performed: true,
    runner_source_commit: "1".repeat(40),
    runner_ref: "main",
    runner_repository_clean: true,
    provider,
    model: { product_model: model },
    suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
    suite_sha256: suiteSha,
    prompt_contract: "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1",
    prompt_contract_sha256: promptSha,
    customer_private_content_included: false,
    raw_customer_content_included: false,
    raw_reasoning_persisted: false,
    raw_model_output_persisted: false,
    economics: {
      estimated_supplier_cost_usd: Number((caseIds.length * 0.0005).toFixed(8)),
      cost_measurement_source: "RUNNER_SUM_OF_RECOMPUTED_CASE_COSTS_V1",
    },
    observations: observations(caseIds, wallMs, { qualityScore, categoryByCase }),
  };
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "avantiqo-code-competitive-"));
  const suiteSource = await readFile(SUITE_PATH, "utf8");
  const suite = JSON.parse(suiteSource);
  const promptSource = await readFile(PROMPT_PATH, "utf8");
  const caseIds = suite.cases.map((item) => item.case_id).sort();
  const categoryByCase = Object.fromEntries(suite.cases.map((item) => [item.case_id, item.category]));
  const suiteSha = sha256(suiteSource);
  const promptSha = sha256(promptSource);
  const ownedPath = join(dir, "owned.json");
  const refAPath = join(dir, "ref-a.json");
  const refBPath = join(dir, "ref-b.json");
  const outputPath = join(dir, "competitive.json");
  const owned = attestCodeAICompetitiveOwnedReport({
    contract: "AVANTIQO_CODE_FRONTIER_LOCAL_RUNNER_V1",
    benchmark_run_id: "55555555-5555-4555-8555-555555555555",
    generated_at: new Date().toISOString(),
    measurement_mode: "LIVE_OWNED_LOCAL_NODE",
    model: { provider: "avantiqo-code", product_model: "avantiqo-code-v1" },
    runner_source_commit: "1".repeat(40),
    runner_ref: "main",
    runner_repository_clean: true,
    suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
    suite_sha256: suiteSha,
    prompt_contract: "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1",
    prompt_contract_sha256: promptSha,
    local_owned_only: true,
    external_fallback_allowed: false,
    external_provider_execution_performed: false,
    raw_model_output_persisted: false,
    raw_reasoning_persisted: false,
    raw_model_output_persisted: false,
    summary: { passed: true, complete_suite: true },
    economics: {
      estimated_supplier_cost_usd: Number((caseIds.length * 0.0005).toFixed(8)),
      cost_measurement_source: "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1",
      owned_compute_usd_per_hour: 1.8,
      owned_compute_rate_source: "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1",
    },
    observations: observations(caseIds, 50, { categoryByCase }).map((item) => ({
      ...item,
      inference_elapsed_ms: 1000,
      owned_compute_usd_per_hour: 1.8,
      owned_compute_rate_source: "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1",
      cost_measurement_source: "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1",
      supplier_cost_usd: 0.0005,
    })),
  }, { env });
  await writeFile(ownedPath, JSON.stringify(owned));
  const refA = attestCodeAICompetitiveReferenceReport(referenceReport({
    provider: "openai", model: "model-a", caseIds, suiteSha, promptSha, wallMs: 100, categoryByCase,
  }), { env });
  const refB = attestCodeAICompetitiveReferenceReport(referenceReport({
    provider: "google", model: "model-b", caseIds, suiteSha, promptSha, wallMs: 110, categoryByCase,
  }), { env });
  await writeFile(refAPath, JSON.stringify(refA));
  await writeFile(refBPath, JSON.stringify(refB));
  return { dir, ownedPath, refAPath, refBPath, outputPath, refA };
}

function runBenchmark(paths) {
  return spawnSync(process.execPath, ["scripts/benchmark-avantiqo-code-competitive.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      AVANTIQO_CODE_COMPETITIVE_OWNED: paths.ownedPath,
      AVANTIQO_CODE_COMPETITIVE_REFERENCES: `${paths.refAPath},${paths.refBPath}`,
      AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS: JSON.stringify({ openai: "model-a", google: "model-b" }),
      AVANTIQO_CODE_COMPETITIVE_OUTPUT: paths.outputPath,
    },
  });
}

test("competitive certification requires valid attested live reference artifacts end to end", async () => {
  const paths = await fixture();
  const passed = runBenchmark(paths);
  assert.equal(passed.status, 0, passed.stderr || passed.stdout);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  assert.equal(report.competitive_certified, true);
  assert.equal(report.competitive_certified, true);
  assert.equal(report.quality_superiority_observed, false);
  assert.equal(report.superiority_claim_allowed, false);
  assert.equal(report.requirements.cryptographic_reference_attestation_required, true);

  const tampered = structuredClone(paths.refA);
  tampered.observations[0].wall_ms = 1;
  await writeFile(paths.refAPath, JSON.stringify(tampered));
  const rejected = runBenchmark(paths);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_INVALID/);
});


test("near-equal quality scores remain ties and cannot establish superiority", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item) => ({ ...item, quality_score: 0.81 }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));

  for (const referencePath of [paths.refAPath, paths.refBPath]) {
    const current = JSON.parse(await readFile(referencePath, "utf8"));
    const unsigned = { ...current, observations: current.observations.map((item) => ({ ...item, quality_score: 0.80 })) };
    delete unsigned.attestation;
    const resigned = attestCodeAICompetitiveReferenceReport(unsigned, { env });
    await writeFile(referencePath, JSON.stringify(resigned));
  }

  const run = runBenchmark(paths);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  for (const reference of report.comparisons) {
    assert.equal(reference.wins, 0);
    assert.equal(reference.losses, 0);
    assert.equal(reference.ties, reference.case_count);
    assert.equal(reference.cases[0].quality_score_delta, 0.01);
  }
  assert.equal(report.quality_superiority_observed, false);
  assert.equal(report.superiority_claim_allowed, false);
});


test("single material quality win cannot establish superiority", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item, index) => ({
    ...item,
    quality_score: index === 0 ? 0.90 : 0.85,
  }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));

  for (const referencePath of [paths.refAPath, paths.refBPath]) {
    const current = JSON.parse(await readFile(referencePath, "utf8"));
    const unsigned = { ...current, observations: current.observations.map((item) => ({ ...item, quality_score: 0.85 })) };
    delete unsigned.attestation;
    const resigned = attestCodeAICompetitiveReferenceReport(unsigned, { env });
    await writeFile(referencePath, JSON.stringify(resigned));
  }

  const run = runBenchmark(paths);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  for (const reference of report.comparisons) {
    assert.equal(reference.wins, 1);
    assert.equal(reference.losses, 0);
    assert.ok(reference.quality_win_rate < 0.10);
  }
  assert.equal(report.quality_superiority_observed, false);
  assert.equal(report.superiority_claim_allowed, false);
});


test("three wins in one canonical category cannot establish broad superiority", async () => {
  const paths = await fixture();
  const suite = JSON.parse(await readFile(SUITE_PATH, "utf8"));
  const securityCases = new Set(suite.cases.filter((item) => item.category === "security").slice(0, 3).map((item) => item.case_id));
  assert.equal(securityCases.size, 3);
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item) => ({ ...item, quality_score: securityCases.has(item.case_id) ? 0.90 : 0.85 }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));

  for (const referencePath of [paths.refAPath, paths.refBPath]) {
    const current = JSON.parse(await readFile(referencePath, "utf8"));
    const unsigned = { ...current, observations: current.observations.map((item) => ({ ...item, quality_score: 0.85 })) };
    delete unsigned.attestation;
    await writeFile(referencePath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  }

  const run = runBenchmark(paths);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  for (const reference of report.comparisons) {
    assert.equal(reference.wins, 3);
    assert.equal(reference.quality_win_rate, 0.1);
    assert.deepEqual(reference.quality_win_categories, ["security"]);
    assert.equal(reference.quality_win_category_count, 1);
  }
  assert.equal(report.quality_superiority_observed, false);
  assert.equal(report.superiority_claim_allowed, false);
});

test("spoofed observation category is rejected against the canonical suite", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations[0].category = "spoofed-category";
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_CANONICAL_CATEGORY_MISMATCH/);
});

test("duplicate vendor references cannot satisfy the provider floor", async () => {
  const paths = await fixture();
  const current = JSON.parse(await readFile(paths.refBPath, "utf8"));
  const unsigned = { ...current, provider: "openai" };
  delete unsigned.attestation;
  await writeFile(paths.refBPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_PROVIDERS_MISSING:google/);
});


test("wrong model under correct provider cannot satisfy the floor", async () => {
  const paths = await fixture();
  const current = JSON.parse(await readFile(paths.refBPath, "utf8"));
  const unsigned = { ...current, model: { product_model: "weaker-model" } };
  delete unsigned.attestation;
  await writeFile(paths.refBPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODEL_MISMATCH:google/);
});


test("reference evidence measured too far from owned evidence is rejected", async () => {
  const paths = await fixture();
  const current = JSON.parse(await readFile(paths.refAPath, "utf8"));
  const unsigned = { ...current, generated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() };
  delete unsigned.attestation;
  await writeFile(paths.refAPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_CROSS_EVIDENCE_SKEW_EXCEEDED/);
});

test("duplicate signed benchmark run ids are rejected", async () => {
  const paths = await fixture();
  const refA = JSON.parse(await readFile(paths.refAPath, "utf8"));
  const refB = JSON.parse(await readFile(paths.refBPath, "utf8"));
  const unsigned = { ...refB, benchmark_run_id: refA.benchmark_run_id };
  delete unsigned.attestation;
  await writeFile(paths.refBPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_UNIQUE_BENCHMARK_RUN_IDS_REQUIRED/);
});


test("owned benchmark below the absolute quality floor is rejected", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item, index) => ({ ...item, quality_score: index === 0 ? 0.49 : 0.85 }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_OWNED_ABSOLUTE_QUALITY_FLOOR_NOT_MET/);
});

test("owned benchmark below the absolute mean quality floor is rejected", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item) => ({ ...item, quality_score: 0.60 }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_OWNED_ABSOLUTE_QUALITY_FLOOR_NOT_MET/);
});


test("degraded reference below the absolute quality floor is rejected", async () => {
  const paths = await fixture();
  const current = JSON.parse(await readFile(paths.refBPath, "utf8"));
  const unsigned = { ...current, observations: current.observations.map((item) => ({ ...item, quality_score: 0.60 })) };
  delete unsigned.attestation;
  await writeFile(paths.refBPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_REFERENCE_ABSOLUTE_QUALITY_FLOOR_NOT_MET:google/);
});


test("duplicate cross-case template fingerprints are rejected", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations[1].response_template_fingerprint_sha256 = owned.observations[0].response_template_fingerprint_sha256;
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  assert.equal(report.competitive_certified, false);
  assert.equal(report.comparisons[0].gates.owned_cross_case_templates_unique, false);
  assert.equal(report.comparisons[1].gates.owned_cross_case_templates_unique, false);
});


test("near-duplicate cross-case template simhashes are rejected", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations[1].response_template_simhash64 = owned.observations[0].response_template_simhash64.slice(0, 15) +
    (owned.observations[0].response_template_simhash64.endsWith("0") ? "1" : "0");
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  assert.equal(report.comparisons[0].gates.owned_cross_case_templates_unique, false);
  assert.ok(report.comparisons[0].owned_template_fingerprints.minimum_simhash_hamming_distance < 8);
});
