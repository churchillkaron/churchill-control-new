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

const SECRET = "competitive-reference-integration-secret-0123456789abcdef";
const SUITE_PATH = "benchmarks/avantiqo-code-frontier-engineering-suite.json";
const PROMPT_PATH = "benchmarks/avantiqo-code-frontier-prompt-contract.json";
const env = { AVANTIQO_CODE_COMPETITIVE_REFERENCE_ATTESTATION_SECRET: SECRET };
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

function observations(caseIds, wallMs) {
  return caseIds.map((case_id, index) => ({
    case_id,
    passed: true,
    wall_ms: wallMs + index,
    supplier_cost_usd: 0.0005,
  }));
}

function referenceReport({ provider, model, caseIds, suiteSha, promptSha, wallMs }) {
  return {
    contract: "AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPORT_V1",
    generator_contract: "AVANTIQO_CODE_COMPETITIVE_REFERENCE_RUNNER_V1",
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
    economics: { estimated_supplier_cost_usd: 0.02 },
    observations: observations(caseIds, wallMs),
  };
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "avantiqo-code-competitive-"));
  const suiteSource = await readFile(SUITE_PATH, "utf8");
  const suite = JSON.parse(suiteSource);
  const promptSource = await readFile(PROMPT_PATH, "utf8");
  const caseIds = suite.cases.map((item) => item.case_id).sort();
  const suiteSha = sha256(suiteSource);
  const promptSha = sha256(promptSource);
  const ownedPath = join(dir, "owned.json");
  const refAPath = join(dir, "ref-a.json");
  const refBPath = join(dir, "ref-b.json");
  const outputPath = join(dir, "competitive.json");
  await writeFile(ownedPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    model: { provider: "avantiqo-code", product_model: "avantiqo-code-v1" },
    runner_source_commit: "1".repeat(40),
    runner_ref: "main",
    runner_repository_clean: true,
    prompt_contract: "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1",
    prompt_contract_sha256: promptSha,
    summary: { passed: true, complete_suite: true },
    economics: { estimated_supplier_cost_usd: 0.01 },
    observations: observations(caseIds, 50),
  }));
  const refA = attestCodeAICompetitiveReferenceReport(referenceReport({
    provider: "reference-a", model: "model-a", caseIds, suiteSha, promptSha, wallMs: 100,
  }), { env });
  const refB = attestCodeAICompetitiveReferenceReport(referenceReport({
    provider: "reference-b", model: "model-b", caseIds, suiteSha, promptSha, wallMs: 110,
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
  assert.equal(report.superiority_claim_allowed, true);
  assert.equal(report.requirements.cryptographic_reference_attestation_required, true);

  const tampered = structuredClone(paths.refA);
  tampered.observations[0].wall_ms = 1;
  await writeFile(paths.refAPath, JSON.stringify(tampered));
  const rejected = runBenchmark(paths);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_INVALID/);
});
