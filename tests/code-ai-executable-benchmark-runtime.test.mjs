import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  executableBenchmarkMissionInput,
  projectCodeAIExecutableBenchmarkCandidate,
  verifyCodeAIExecutableBenchmarkResult,
} from "../lib/code/runtime/CodeAIExecutableBenchmarkRuntime.js";

const suite = JSON.parse(await readFile("benchmarks/avantiqo-code-executable-engineering-suite.json", "utf8"));
const finite = suite.cases.find((item) => item.case_id === "exec_finite_sum");

function resultFor(content, extra = {}) {
  return {
    success: true,
    status: "completed",
    employee_completion: { complete: true },
    state: {
      files_changed: ["src/math.mjs"],
      source_changes: [{ path: "src/math.mjs", operation: "write", content }],
      verification: [{ operation_id: "verify_public", passed: true }],
      tests: [{
        operation_id: "verify_public",
        command: "node",
        args: ["tests/public.test.mjs"],
        exit_code: 0,
      }],
      patch: "diff --git a/src/math.mjs b/src/math.mjs",
      ...extra,
    },
  };
}

test("executable benchmark mission binds allowed paths and exact public verifier", () => {
  const mission = executableBenchmarkMissionInput(finite);
  assert.match(mission.objective, /You may edit only: src\/math\.mjs/);
  assert.equal(mission.objective_context.authoritative_verification_command, "node");
  assert.deepEqual(mission.objective_context.authoritative_verification_args, ["tests/public.test.mjs"]);
  assert.deepEqual(mission.objective_context.allowed_edit_paths, ["src/math.mjs"]);
  assert.equal(mission.objective_context.implementation_required, true);
});

test("candidate projection requires exact scope and observed verifier", () => {
  const correct = resultFor(
    "export function sumFinite(values){ if(!Array.isArray(values)) throw new TypeError('values must be array'); return values.reduce((sum,value)=>sum+(typeof value==='number'&&Number.isFinite(value)?value:0),0); }\n",
  );
  const projection = projectCodeAIExecutableBenchmarkCandidate(finite, correct);
  assert.equal(projection.scope_passed, true);
  assert.equal(projection.public_verifier_observed, true);
  assert.equal(projection.completion_verified, true);
  assert.equal(projection.final_diff_observed, true);

  const outOfScope = projectCodeAIExecutableBenchmarkCandidate(finite, resultFor(correct.state.source_changes[0].content, {
    files_changed: ["src/math.mjs", "tests/public.test.mjs"],
  }));
  assert.equal(outOfScope.scope_passed, false);
});

test("hidden verifier distinguishes genuine repair from visible-only completion claim", async () => {
  const correct = await verifyCodeAIExecutableBenchmarkResult({
    benchmark_case: finite,
    result: resultFor(
      "export function sumFinite(values){ if(!Array.isArray(values)) throw new TypeError('values must be array'); return values.reduce((sum,value)=>sum+(typeof value==='number'&&Number.isFinite(value)?value:0),0); }\n",
    ),
  });
  assert.equal(correct.passed, true);
  assert.equal(correct.hidden_verifier_passed, true);

  const wrong = await verifyCodeAIExecutableBenchmarkResult({
    benchmark_case: finite,
    result: resultFor(
      "export function sumFinite(values){ return values.reduce((sum,value)=>sum+(Number.isNaN(value)?0:value),0); }\n",
    ),
  });
  assert.equal(wrong.public_verifier_observed, true);
  assert.equal(wrong.hidden_verifier_passed, false);
  assert.equal(wrong.passed, false);
});
