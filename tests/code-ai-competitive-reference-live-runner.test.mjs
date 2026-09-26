import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  runCodeAICompetitiveReferenceLiveBenchmark,
  gradeCodeAICompetitiveReferenceCase,
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
  const anchors = item.required_evidence.join(" ").replaceAll("_", " ");
  return JSON.stringify({
    case_id: item.case_id,
    diagnosis: `${item.title} requires diagnosis grounded in ${item.category} constraints and the obligations ${anchors}.`,
    solution: `Apply the smallest ${item.category} correction that directly satisfies ${anchors} while preserving unrelated behavior.`,
    verification: `Verify ${anchors} against the ${item.title} scenario with targeted checks before completion.`,
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
      if (case_id === suite.cases[0].case_id) await new Promise((resolve) => setTimeout(resolve, 15));
      return {
        text: responseFor(byId.get(case_id)),
        wall_ms: 1,
        input_tokens: 100,
        output_tokens: 80,
        token_usage_source: "PROVIDER_API_USAGE_V1",
        pricing_input_usd_per_1m: 5,
        pricing_output_usd_per_1m: 10,
        pricing_source: "OPERATOR_APPROVED_REFERENCE_PRICING_V1",
        cost_usd: 999,
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
  assert.equal(report.economics.estimated_supplier_cost_usd, Number((suite.cases.length * 0.0013).toFixed(8)));
  assert.ok(report.observations.every((item) => item.cost_measurement_source === "RUNNER_RECOMPUTED_FROM_USAGE_AND_PRICING_V1"));
  assert.ok(report.observations.every((item) => item.token_usage_source === "PROVIDER_API_USAGE_V1"));
  assert.ok(report.observations.every((item) => item.pricing_source === "OPERATOR_APPROVED_REFERENCE_PRICING_V1"));
  assert.equal(report.observations[0].supplier_cost_usd, 0.0013);
  assert.equal(report.observations[0].provider_reported_cost_usd, 999);
  assert.ok(report.observations.every((item) => item.raw_output_persisted === false));
  assert.ok(report.observations.every((item) => item.latency_measurement_source === "RUNNER_MONOTONIC_CLOCK_V1"));
  assert.equal(report.observations[0].provider_reported_wall_ms, 1);
  assert.ok(report.observations[0].wall_ms >= 10);
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


test("reference grading exposes deterministic quality depth without raw output persistence", () => {
  const benchmarkCase = {
    case_id: "depth-case",
    required_evidence: ["proof_a", "proof_b"],
  };
  const shallow = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "depth-case",
    diagnosis: "A concrete diagnosis with enough detail to satisfy the minimum requirement.",
    solution: "A concrete solution with enough detail to satisfy the minimum requirement.",
    verification: "A concrete verification plan with enough detail to satisfy the minimum requirement.",
    evidence: { proof_a: "Concrete proof A here.", proof_b: "Concrete proof B here." },
  }));
  const deep = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "depth-case",
    diagnosis: "The failure is isolated to the request boundary where independently safe reads are serialized behind one another, increasing interactive latency without changing semantics. The diagnosis distinguishes transport delay from computation and identifies the exact concurrency boundary that must remain scoped.",
    solution: "Run only the independent reads concurrently with Promise.all while preserving the existing authorization checks, error propagation, and output ordering. Keep dependent reads sequential and avoid broadening mutation authority or swallowing a failed read.",
    verification: "Measure wall time before and after on the same inputs, assert identical response payloads, preserve individual failure behavior, and run the existing regression suite plus a focused concurrency test that proves both reads begin before either completes.",
    evidence: {
      proof_a: "Proof A names the exact parallelization boundary, preserves existing authorization and error semantics, and avoids unrelated changes.",
      proof_b: "Proof B requires semantic equivalence, measured latency improvement, and a focused concurrency assertion rather than a generic test claim.",
    },
  }));
  assert.equal(shallow.passed, true);
  assert.equal(deep.passed, true);
  assert.ok(deep.quality_score > shallow.quality_score);
  assert.equal(deep.evidence_key_count, 2);
});

test("quality depth resists verbosity padding with repeated language", () => {
  const benchmarkCase = { case_id: "padding-case", required_evidence: ["proof"] };
  const repeated = "repeat token ".repeat(80);
  const padded = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "padding-case",
    diagnosis: repeated,
    solution: repeated,
    verification: repeated,
    evidence: { proof: repeated },
  }));
  const specific = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "padding-case",
    diagnosis: "The authorization check is evaluated before organization scope is bound, allowing a valid user token to reach records outside the selected organization boundary.",
    solution: "Resolve organization_id from the authenticated business context first, require it in the query predicate, and reject any caller-supplied organization that differs from the resolved scope.",
    verification: "Run one positive same-organization read and one negative cross-organization read, asserting the negative case returns no records and cannot fall back to an unscoped query.",
    evidence: { proof: "The proposed check binds authenticated organization scope directly into the data predicate and includes an explicit cross-organization negative test." },
  }));
  assert.equal(padded.passed, true);
  assert.equal(specific.passed, true);
  assert.ok(specific.quality_score > padded.quality_score);
});


test("quality scoring rewards evidence grounded in the case obligations", () => {
  const benchmarkCase = {
    case_id: "grounding-case",
    category: "security",
    title: "Bind organization scope and prove cross-organization isolation",
    required_evidence: ["organization_bound", "negative_test"],
  };
  const generic = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "grounding-case",
    diagnosis: "The implementation has a concrete authorization defect that needs a narrowly scoped correction at the data-access boundary.",
    solution: "Apply a minimal guarded change that preserves unrelated behavior and keeps the runtime fail closed on invalid requests.",
    verification: "Exercise the corrected behavior with targeted checks and confirm the previous unsafe behavior is no longer possible.",
    evidence: {
      organization_bound: "A concrete control is added at the relevant boundary and checked before returning data.",
      negative_test: "A focused regression scenario demonstrates that the unsafe path is rejected after the correction.",
    },
  }));
  const grounded = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "grounding-case",
    diagnosis: "The security failure comes from reading records before the authenticated organization scope is bound into the data predicate.",
    solution: "Bind organization_id from Business Context into the query and reject any cross-organization caller scope before the read executes.",
    verification: "Run a same-organization positive case and a cross-organization negative test that must return no records and no fallback data.",
    evidence: {
      organization_bound: "The organization_id from authenticated Business Context is required in the query predicate before records can be returned.",
      negative_test: "The negative test uses a different organization_id and verifies that cross-organization records are rejected with no unscoped fallback.",
    },
  }));
  assert.equal(generic.passed, true);
  assert.equal(grounded.passed, true);
  assert.equal(generic.evidence_grounding_score, 0);
  assert.ok(grounded.evidence_grounding_score > 0);
  assert.ok(grounded.quality_score > generic.quality_score);
});


test("narrative grounding penalizes generic diagnosis solution and verification", () => {
  const benchmarkCase = {
    case_id: "narrative-grounding-case",
    category: "performance",
    title: "Parallelize independent reads while preserving semantic equivalence",
    required_evidence: ["parallelized", "semantic_equivalence", "latency_measurement"],
  };
  const generic = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "narrative-grounding-case",
    diagnosis: "The implementation contains a concrete issue that should be corrected with a narrowly scoped change while preserving unrelated behavior.",
    solution: "Apply the smallest safe implementation change at the relevant boundary and keep existing authorization and error handling intact.",
    verification: "Use focused regression checks to confirm the intended behavior and make sure no unrelated behavior changes after the update.",
    evidence: {
      parallelized: "Independent reads are parallelized at the request boundary rather than executed serially.",
      semantic_equivalence: "Semantic equivalence is verified by comparing the response payload and failure behavior before and after parallelization.",
      latency_measurement: "Latency measurement captures the same request before and after the independent reads are parallelized.",
    },
  }));
  const grounded = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "narrative-grounding-case",
    diagnosis: "Two independent reads execute serially, adding avoidable request latency even though neither read depends on the other result.",
    solution: "Parallelize the independent reads with Promise.all while preserving semantic equivalence, output ordering, and the existing per-read failure behavior.",
    verification: "Measure request latency before and after parallelization and compare payload semantics so the faster path remains behaviorally equivalent.",
    evidence: {
      parallelized: "Independent reads are parallelized at the request boundary rather than executed serially.",
      semantic_equivalence: "Semantic equivalence is verified by comparing the response payload and failure behavior before and after parallelization.",
      latency_measurement: "Latency measurement captures the same request before and after the independent reads are parallelized.",
    },
  }));
  assert.equal(generic.passed, true);
  assert.equal(grounded.passed, true);
  assert.ok(generic.narrative_grounding_score < 0.5);
  assert.ok(grounded.narrative_grounding_score >= 0.5);
  assert.ok(grounded.quality_score > generic.quality_score);
});


test("evidence obligations must be independently substantiated rather than duplicated", () => {
  const benchmarkCase = {
    case_id: "distinct-evidence-case",
    category: "security",
    title: "Bind organization scope and verify negative access behavior",
    required_evidence: ["organization_bound", "negative_test", "no_role_broadening"],
  };
  const duplicated = "Organization scope is bound in the query and the negative test confirms access is rejected without broadening the role.";
  const duplicateGrade = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "distinct-evidence-case",
    diagnosis: "The security defect allows access without binding organization scope to the authenticated business context.",
    solution: "Bind organization_id in the data predicate and keep role authority unchanged while rejecting mismatched organization access.",
    verification: "Use a negative cross-organization test and confirm the authorized same-organization path remains unchanged.",
    evidence: { organization_bound: duplicated, negative_test: duplicated, no_role_broadening: duplicated },
  }));
  const distinctGrade = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify({
    case_id: "distinct-evidence-case",
    diagnosis: "The security defect allows access without binding organization scope to the authenticated business context.",
    solution: "Bind organization_id in the data predicate and keep role authority unchanged while rejecting mismatched organization access.",
    verification: "Use a negative cross-organization test and confirm the authorized same-organization path remains unchanged.",
    evidence: {
      organization_bound: "The query predicate requires organization_id resolved from authenticated Business Context before any record is returned.",
      negative_test: "A request using a different organization_id is rejected and returns no cross-organization records or fallback data.",
      no_role_broadening: "The existing role check is preserved exactly; the patch adds scope binding without granting any new permission or role capability.",
    },
  }));
  assert.equal(duplicateGrade.passed, true);
  assert.equal(distinctGrade.passed, true);
  assert.equal(duplicateGrade.evidence_distinctness_score, 0);
  assert.ok(distinctGrade.evidence_distinctness_score >= 0.25);
  assert.ok(distinctGrade.quality_score > duplicateGrade.quality_score);
});


test("template fingerprint ignores case anchor substitutions while preserving substantive structure", () => {
  const firstCase = {
    case_id: "template-a",
    category: "security",
    title: "Protect shared request boundary with organization scope",
    required_evidence: ["organization_bound", "negative_test"],
  };
  const secondCase = {
    case_id: "template-b",
    category: "performance",
    title: "Protect shared request boundary with latency measurement",
    required_evidence: ["latency_measurement", "semantic_equivalence"],
  };
  const first = gradeCodeAICompetitiveReferenceCase(firstCase, JSON.stringify({
    case_id: "template-a",
    diagnosis: "Organization scope requires a concrete correction at the shared request boundary while preserving unrelated behavior.",
    solution: "Organization scope control applies at the shared request boundary while preserving unrelated behavior and existing failure handling.",
    verification: "Negative test coverage checks the shared request boundary and compares behavior before and after the correction.",
    evidence: {
      organization_bound: "Organization scope coverage checks the shared request boundary while unrelated behavior remains preserved.",
      negative_test: "Negative test control applies at the shared request boundary while unrelated behavior remains preserved.",
    },
  }));
  const second = gradeCodeAICompetitiveReferenceCase(secondCase, JSON.stringify({
    case_id: "template-b",
    diagnosis: "Request latency requires a concrete correction at the shared request boundary while preserving unrelated behavior.",
    solution: "Latency measurement control applies at the shared request boundary while preserving unrelated behavior and existing failure handling.",
    verification: "Semantic equivalence coverage checks the shared request boundary and compares behavior before and after the correction.",
    evidence: {
      latency_measurement: "Latency measurement control applies at the shared request boundary while unrelated behavior remains preserved.",
      semantic_equivalence: "Semantic equivalence coverage checks the shared request boundary while unrelated behavior remains preserved.",
    },
  }));
  assert.equal(first.passed, true);
  assert.equal(second.passed, true);
  assert.match(first.response_template_fingerprint_sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.response_template_fingerprint_sha256, second.response_template_fingerprint_sha256);
});


test("template simhash remains close after a small generic filler change", () => {
  const benchmarkCase = {
    case_id: "simhash-case",
    category: "performance",
    title: "Parallelize independent reads",
    required_evidence: ["parallelized", "latency_measurement"],
  };
  const base = {
    case_id: "simhash-case",
    diagnosis: "Independent reads execute serially at the request boundary and add avoidable delay.",
    solution: "Parallelize the independent reads while preserving output ordering and existing failure handling.",
    verification: "Measure latency before and after the change and compare the response behavior for equivalence.",
    evidence: {
      parallelized: "Independent reads execute concurrently after the change while preserving the request boundary.",
      latency_measurement: "Latency measurement compares the same request before and after parallel execution.",
    },
  };
  const changed = structuredClone(base);
  changed.solution += " This remains narrowly scoped.";
  const first = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify(base));
  const second = gradeCodeAICompetitiveReferenceCase(benchmarkCase, JSON.stringify(changed));
  const distance = (() => {
    let value = BigInt(`0x${first.response_template_simhash64}`) ^ BigInt(`0x${second.response_template_simhash64}`);
    let count = 0;
    while (value) { count += Number(value & 1n); value >>= 1n; }
    return count;
  })();
  assert.notEqual(first.response_template_fingerprint_sha256, second.response_template_fingerprint_sha256);
  assert.ok(distance < 8);
});
