import test from "node:test";
import assert from "node:assert/strict";
import { resolveCodeAIPlannerOutputTokenBudget } from "../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js";

test("planner output budget stays compact for discovery and tiny repairs", () => {
  assert.equal(resolveCodeAIPlannerOutputTokenBudget({
    state: {},
    action_policy: { discovery_locked: false },
    allowed_edit_paths: ["lib/a.js"],
  }), 1400);

  assert.equal(resolveCodeAIPlannerOutputTokenBudget({
    state: {
      source_read_evidence: [{
        action: "read",
        result: { file_path: "lib/a.js", content: "x".repeat(900) },
      }],
    },
    action_policy: { discovery_locked: true },
    allowed_edit_paths: ["lib/a.js"],
  }), 1400);
});

test("multi-file implementation uses the primary model tier even when files are small", () => {
  const budget = resolveCodeAIPlannerOutputTokenBudget({
    state: {
      source_read_evidence: [
        { action: "read", result: { file_path: "lib/a.js", content: "export const a = 1;" } },
        { action: "read", result: { file_path: "lib/b.js", content: "export const b = 2;" } },
      ],
    },
    action_policy: { discovery_locked: true },
    allowed_edit_paths: ["lib/a.js", "lib/b.js"],
  });
  assert.equal(budget, 2600);
});

test("planner output budget scales with observed editable source size", () => {
  const medium = resolveCodeAIPlannerOutputTokenBudget({
    state: {
      source_read_evidence: [{
        action: "read",
        result: { file_path: "lib/a.js", content: "x".repeat(6000) },
      }],
    },
    action_policy: { discovery_locked: true },
    allowed_edit_paths: ["lib/a.js"],
  });
  assert.equal(medium, 2700);

  const large = resolveCodeAIPlannerOutputTokenBudget({
    state: {
      source_read_evidence: [{
        action: "read",
        result: { file_path: "lib/a.js", content: "x".repeat(15000) },
      }],
    },
    action_policy: { discovery_locked: true },
    allowed_edit_paths: ["lib/a.js"],
  });
  assert.equal(large, 4096);
});

test("compact JSON repair remains hard-capped", () => {
  assert.equal(resolveCodeAIPlannerOutputTokenBudget({
    state: {},
    action_policy: {},
    allowed_edit_paths: [],
    compact_json_only: true,
  }), 1400);
});
