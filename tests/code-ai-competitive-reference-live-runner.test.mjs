import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  runCodeAICompetitiveReferenceLiveBenchmark,
} from "../lib/code/runtime/CodeAICompetitiveReferenceLiveRunnerRuntime.js";
import {
  verifyCodeAICompetitiveReferenceReport,
} from "../lib/code/runtime/CodeAICompetitiveReferenceAttestationRuntime.js";

const SECRET = "competitive-live-runner-secret-0123456789abcdef";
const env = { AVANTIQO_CODE_COMPETITIVE_REFERENCE_ATTESTATION_SECRET: SECRET };
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

function responseFor(item) {
  const evidence = Object.fromEntries(
    item.required_evidence.map((key) => [key, `Concrete verification requirement for ${key}`]),
  );
  return JSON.stringify({
    case_id: item.case_id,
    diagnosis: "The scenario requires a bounded root-cause diagnosis using the supplied constraints.",
    solution: "Apply the smallest compatible correction at the canonical ownership boundary and preserve unrelated behavior.",
    verification: "Run the exact targeted checks and regression evidence required by the scenario before completion.",
    evidence,
  });
}

test("controlled live reference runner uses the canonical prompt contract and signs only projected evidence", async () => {
  const suiteSource = await readFile("benchmarks/avantiqo-code-frontier-engineering-suite.json", "utf8");
  const promptSource = await readFile("benchmarks/avantiqo-code-frontier-prompt-contract.json", "utf8");
  const suite = JSON.parse(suiteSource);
  const promptContract = JSON.parse(promptSource);
  const byId = new Map(suite.cases.map((item) => [item.case_id, item]));
  const seenPrompts = [];
  const report = await runCodeAICompetitiveReferenceLiveBenchmark({
    suite,
    prompt_contract: promptContract,
    suite_sha256: sha256(suiteSource),
    prompt_contract_sha256: sha256(promptSource),
    provider: "mock-reference",
    model: "mock-frontier-model",
    attestation_env: env,
    runner_provenance: { source_commit: "2".repeat(40), ref: "main", repository_clean: true },
    execute_provider: async ({ prompt, case_id }) => {
      seenPrompts.push(prompt);
      return {
        text: responseFor(byId.get(case_id)),
        wall_ms: 25,
        input_tokens: 100,
        output_tokens: 80,
        cost_usd: 0.002,
      };
    },
  });
  assert.equal(seenPrompts.length, suite.cases.length);
  assert.equal(report.summary.complete_suite, true);
  assert.equal(report.summary.passed, true);
  assert.equal(report.summary.pass_rate, 1);
  assert.equal(report.raw_model_output_persisted, false);
  assert.equal(report.raw_reasoning_persisted, false);
  assert.equal(report.normal_avantiqo_code_execution_uses_reference_provider, false);
  assert.equal(report.economics.estimated_supplier_cost_usd, Number((suite.cases.length * 0.002).toFixed(8)));
  assert.ok(report.observations.every((item) => item.raw_output_persisted === false));
  assert.ok(seenPrompts[0].includes(`Scenario: ${suite.cases[0].title}`));
  assert.equal(verifyCodeAICompetitiveReferenceReport(report, {
    env,
    suite_contract: suite.contract,
    suite_sha256: sha256(suiteSource),
    prompt_contract: promptContract.contract,
    prompt_contract_sha256: sha256(promptSource),
    required_case_ids: suite.cases.map((item) => item.case_id),
  }), true);
});

test("live runner rejects unclean or non-main provenance before provider execution", async () => {
  const suiteSource = await readFile("benchmarks/avantiqo-code-frontier-engineering-suite.json", "utf8");
  const promptSource = await readFile("benchmarks/avantiqo-code-frontier-prompt-contract.json", "utf8");
  let calls = 0;
  await assert.rejects(() => runCodeAICompetitiveReferenceLiveBenchmark({
    suite: JSON.parse(suiteSource),
    prompt_contract: JSON.parse(promptSource),
    suite_sha256: sha256(suiteSource),
    prompt_contract_sha256: sha256(promptSource),
    provider: "mock-reference",
    model: "mock-model",
    runner_provenance: { source_commit: "3".repeat(40), ref: "main", repository_clean: false },
    attestation_env: env,
    execute_provider: async () => { calls += 1; return {}; },
  }), /CODE_AI_COMPETITIVE_REFERENCE_CURRENT_CLEAN_MAIN_REQUIRED/);
  assert.equal(calls, 0);
});

test("live provider script fails closed before network execution without explicit approval", () => {
  const result = spawnSync(process.execPath, ["scripts/run-avantiqo-code-competitive-reference-live.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AVANTIQO_CODE_COMPETITIVE_LIVE_REFERENCE_APPROVED: "NO",
      AVANTIQO_CODE_COMPETITIVE_REFERENCE_PROVIDER: "openai",
      AVANTIQO_CODE_COMPETITIVE_REFERENCE_MODEL: "unused",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AVANTIQO_CODE_COMPETITIVE_LIVE_REFERENCE_APPROVED=YES_REQUIRED/);
});
