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


test("planner prompt enters mutation focus after reproduced failure and established hypotheses", () => {
  const result = buildCodeAIPlannerPromptTransport({
    objective: "Repair the reproduced defect.",
    iteration: 8,
    state: {
      mission_id: "mutation-focus-test",
      base_commit: "b".repeat(40),
      status: "repair_required",
      objective_context: { implementation_required: true },
      source_change_count: 0,
      evidence: [
        {
          kind: "operation",
          operation_id: "repro-op",
          action: "record_reproduction",
          status: "completed",
          result: { status: "FAILED", source_revision: 0, same_reproduction_key: "fixture" },
        },
        {
          kind: "operation",
          operation_id: "hyp-op",
          action: "record_hypotheses",
          status: "completed",
          result: {
            hypotheses: [
              { id: "H1", status: "PLAUSIBLE" },
              { id: "H2", status: "PLAUSIBLE" },
              { id: "H3", status: "PLAUSIBLE" },
            ],
          },
        },
      ],
      source_read_evidence: [read("read-1", "lib/target.js", "TARGET")],
      verification: [{ operation_id: "verify-1", passed: false }],
      autonomy_control: { remaining_iterations: 5, evidence_revision: 8, source_revision: 0 },
    },
    allowed_actions: ["search", "run", "apply_files", "replace_range", "block"],
  });
  assert.match(result.instruction, /MUTATION FOCUS/);
  assert.match(result.instruction, /apply_files or replace_range/);
  assert.match(result.instruction, /replace_range: .*expected.*replacement/);
});


test("planner transport preserves declared verifier source contents", () => {
  const declaredReads = [
    {
      kind: "operation",
      operation_id: "declared-source-1",
      action: "read",
      status: "completed",
      result: {
        file_path: "lib/normalize-money.mjs",
        start_line: 1,
        end_line: 3,
        total_lines: 3,
        content: "export function normalizeMoney(value) { return Number(value); }",
      },
    },
    {
      kind: "operation",
      operation_id: "declared-source-2",
      action: "read",
      status: "completed",
      result: {
        file_path: "lib/invoice-summary.mjs",
        start_line: 1,
        end_line: 8,
        total_lines: 8,
        content: "export function summarizeInvoice(lines) { return lines; }",
      },
    },
    {
      kind: "operation",
      operation_id: "declared-verifier",
      action: "read",
      status: "completed",
      result: {
        file_path: "scripts/fixture-test.mjs",
        start_line: 1,
        end_line: 10,
        total_lines: 10,
        content: "assert.equal(normalizeMoney(\"12.50\"), 12.5); assert.equal(summary.valid_line_count, 2);",
      },
    },
  ];
  const result = buildCodeAIPlannerPromptTransport({
    objective: "Repair the declared fixture.",
    iteration: 1,
    state: {
      mission_id: "declared-evidence-transport",
      base_commit: "c".repeat(40),
      status: "completed",
      objective_context: {
        implementation_required: true,
        evidence_path_1: "lib/normalize-money.mjs",
        evidence_path_2: "lib/invoice-summary.mjs",
        evidence_path_3: "scripts/fixture-test.mjs",
        authoritative_verification_command: "node",
        authoritative_verification_args: ["scripts/fixture-test.mjs"],
      },
      source_read_evidence: declaredReads,
      autonomy_control: { remaining_iterations: 8, evidence_revision: 0, source_revision: 0 },
    },
    allowed_actions: ["record_hypotheses", "verify", "apply_files", "replace_range", "block"],
  });
  assert.ok(result.instruction.includes('normalizeMoney(\\"12.50\\")'));
  assert.match(result.instruction, /valid_line_count/);
  assert.ok(result.state_chars <= result.structured_specification.planner_state_max_chars);
});
