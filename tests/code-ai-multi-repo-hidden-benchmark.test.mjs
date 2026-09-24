import test from "node:test";
import assert from "node:assert/strict";
import { coordinateCodeAIMultiRepositoryMission } from "../lib/code/runtime/CodeAIMultiRepositoryMissionRuntime.js";
import { partitionCodeAIHiddenBenchmarkCases, certifyCodeAIHiddenBenchmark } from "../lib/code/runtime/CodeAIHiddenBenchmarkRuntime.js";

test("multi repo coordinator preserves independent heads and dependency order", () => {
  const result = coordinateCodeAIMultiRepositoryMission({ repositories: [
    { id: "api", repository_url: "https://github.com/x/api", base_commit: "a".repeat(40), verified: true },
    { id: "web", repository_url: "https://github.com/x/web", base_commit: "b".repeat(40), verified: true },
  ], dependencies: [{ from: "api", to: "web" }] });
  assert.deepEqual(result.dependency_order, ["api", "web"]); assert.equal(result.all_verified, true); assert.equal(result.merge_authority, false);
});
test("multi repo coordinator rejects dependency cycles", () => assert.throws(() => coordinateCodeAIMultiRepositoryMission({
  repositories: [{ id: "a", repository_url: "r1", base_commit: "a" }, { id: "b", repository_url: "r2", base_commit: "b" }],
  dependencies: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
}), /DEPENDENCY_CYCLE/));
test("hidden benchmark rejects candidate self-report and requires independent artifact proof", () => {
  const cases = Array.from({ length: 40 }, (_, index) => ({
    id: `c${index}`, family: index % 2 ? "ui" : "api", payload: { task: index }, expected: { answer: index },
  }));
  const partition = partitionCodeAIHiddenBenchmarkCases({ cases, salt: "super-secret-benchmark-salt-2026", holdout_percent: 25 });
  assert.ok(partition.held_out_cases.length > 0);
  assert.ok(partition.visible_cases.every((item) => !("expected" in item)));

  const selfReported = certifyCodeAIHiddenBenchmark({
    partition, results: partition.held_out_case_ids.map((id) => ({ id, passed: true })),
  });
  assert.equal(selfReported.verified, false);
  assert.equal(selfReported.candidate_self_report_authority, false);

  const verified = certifyCodeAIHiddenBenchmark({
    partition,
    results: partition.held_out_case_ids.map((id) => ({
      id,
      passed: true,
      verification: { case_id: id, passed: true, independent: true, verifier: "node:test", artifact_sha256: "a".repeat(64) },
    })),
  });
  assert.equal(verified.held_out, true);
  assert.equal(verified.verified, true);
  assert.equal(verified.independent_verification_required, true);
});
