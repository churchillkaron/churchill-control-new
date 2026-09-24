import test from "node:test";
import assert from "node:assert/strict";
import { buildCodeAIPlannerPromptTransport } from "../lib/code/runtime/CodeAIPlannerPromptRuntime.js";

function readEvidence(operationId, path, sha, marker) {
  return {
    kind: "operation",
    operation_id: operationId,
    action: "read",
    status: "completed",
    result: {
      file_path: path,
      start_line: 1,
      end_line: 20,
      total_lines: 20,
      content_sha256: sha,
      content_bytes: marker.length,
      content: marker,
    },
  };
}

test("planner prompt collapses semantically identical source reads across operation ids", () => {
  const duplicateOld = readEvidence("read-old", "lib/target.js", "a".repeat(64), "SAME_CONTENT");
  const duplicateNew = readEvidence("read-new", "lib/target.js", "a".repeat(64), "SAME_CONTENT");
  const distinct = readEvidence("read-other", "lib/other.js", "b".repeat(64), "OTHER_CONTENT");

  const result = buildCodeAIPlannerPromptTransport({
    objective: "Repair the target module.",
    iteration: 3,
    state: {
      mission_id: "dedup-test",
      base_commit: "c".repeat(40),
      status: "running",
      files_changed: ["lib/target.js"],
      source_read_evidence: [duplicateOld, distinct, duplicateNew],
      evidence: [duplicateOld, distinct, duplicateNew],
      objective_context: {
        allowed_edit_paths: ["lib/target.js"],
        implementation_required: true,
      },
      autonomy_control: { evidence_revision: 4, source_revision: 2 },
    },
    repository_guidance: { verification_commands_text: "node --test tests/target.test.mjs" },
    allowed_actions: ["apply_files", "replace_range", "verify", "diff"],
  });

  const matches = result.instruction.match(/SAME_CONTENT/g) || [];
  assert.equal(matches.length, 2);
  assert.match(result.instruction, /OTHER_CONTENT/);
  assert.doesNotMatch(result.instruction, /read-old/);
  assert.match(result.instruction, /read-new/);
});
