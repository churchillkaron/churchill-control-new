import test from "node:test";
import assert from "node:assert/strict";
import { buildCodeAIPlannerPromptTransport } from "../lib/code/runtime/CodeAIPlannerPromptRuntime.js";

function read(id, path, marker) {
  return {
    kind: "operation",
    operation_id: id,
    action: "read",
    status: "completed",
    result: {
      file_path: path,
      start_line: 1,
      end_line: 80,
      total_lines: 80,
      content: marker + "\n" + "x".repeat(2500),
    },
  };
}

test("planner prompt prioritizes changed and required source reads over unrelated recency", () => {
  const sourceReads = [
    read("target-old", "lib/target.js", "TARGET_CHANGED_MARKER"),
    ...Array.from({ length: 6 }, (_, index) => read(`noise-${index}`, `lib/noise-${index}.js`, `NOISE_${index}`)),
  ];
  const result = buildCodeAIPlannerPromptTransport({
    objective: "Repair lib/target.js without changing unrelated behavior.",
    iteration: 4,
    state: {
      mission_id: "relevance-test",
      base_commit: "a".repeat(40),
      status: "repair_required",
      files_changed: ["lib/target.js"],
      source_read_evidence: sourceReads,
      objective_context: {
        pre_edit_inspection_paths: ["lib/target.js"],
        implementation_required: true,
      },
      autonomy_control: { remaining_iterations: 6, evidence_revision: 7, source_revision: 2 },
    },
    repository_guidance: { verification_commands_text: "node --test tests/target.test.mjs" },
    allowed_actions: ["apply_files", "verify", "diff", "block"],
  });
  assert.match(result.instruction, /TARGET_CHANGED_MARKER/);
  assert.ok(result.state_chars <= result.structured_specification.planner_state_max_chars);
});
