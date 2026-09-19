import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  deriveCodeAIContractFailurePreflight,
  formatCodeAIContractFailurePreflightForObjective,
} from "../lib/code/runtime/CodeAIContractFailurePreflightRuntime.js";

function recurring(...patterns) {
  return {
    recurring: true,
    minimum_distinct_verified_missions: 2,
    patterns: patterns.map(([kind, count]) => ({ kind, verified_mission_count: count })),
  };
}

test("preflight is inactive without recurring verified contract failures", () => {
  const result = deriveCodeAIContractFailurePreflight({ state: {} });
  assert.equal(result.active, false);
  assert.equal(result.check_count, 0);
  assert.equal(result.model_call_performed, false);
  assert.equal(result.source_mutation_authority, false);
});

test("recurring verified contract failures become deterministic preflight checks", () => {
  const result = deriveCodeAIContractFailurePreflight({
    learning: recurring(
      ["OBSERVED_CALL_ARITY_INCOMPATIBLE", 3],
      ["SUPABASE_SELECTED_COLUMN_REMOVED", 2],
    ),
    state: {
      files_changed: ["lib/provider.js"],
      evidence: [{
        action: "read",
        status: "completed",
        result: {
          file_path: "lib/caller.js",
          content: 'import { run } from "./provider.js";\nrun(1, 2);\n',
        },
      }, {
        action: "read",
        status: "completed",
        result: {
          file_path: "lib/provider.js",
          content: 'export function run(a, b) { return a + b; }\n',
        },
      }, {
        action: "read",
        status: "completed",
        result: {
          file_path: "lib/repository.js",
          content: 'export async function load(db) { return db.from("orders").select("id,total"); }\n',
        },
      }],
    },
  });
  assert.equal(result.active, true);
  assert.equal(result.check_count, 2);
  assert.ok(result.checks.some((item) => item.check_id === "PRESERVE_OBSERVED_CALL_ARITY"));
  assert.ok(result.checks.some((item) => item.check_id === "PRESERVE_SUPABASE_SELECTED_COLUMNS"));
  assert.ok(result.evidence_ready_count >= 1);
  assert.equal(result.incomplete_evidence_is_not_compatibility_proof, true);
  assert.match(formatCodeAIContractFailurePreflightForObjective(result), /RECURRING CONTRACT FAILURE PREFLIGHT/);
});

test("work package runtime binds recurring contract preflight before strategic execution and reuses it on resume", async () => {
  const runtime = await readFile("lib/code/runtime/CodeAIWorkPackageRuntime.js", "utf8");
  assert.match(runtime, /deriveCodeAIContractFailurePreflight/);
  assert.match(runtime, /stateWithContractFailurePreflight/);
  assert.match(runtime, /objectiveWithContractFailurePreflight/);
  assert.match(runtime, /contractFailurePreflightAlreadyBound/);
  assert.match(runtime, /contract_failure_preflight/);
  assert.match(runtime, /recurring_contract_failures_inform_first_reasoning_pass:\s*true/);
  assert.match(runtime, /contract_failure_preflight_model_call_performed:\s*false/);
  assert.ok(
    runtime.indexOf("deriveCodeAIContractFailurePreflight") <
      runtime.lastIndexOf("executeCodeAIStrategicBatchedMission"),
  );
});
