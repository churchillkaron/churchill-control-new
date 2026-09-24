import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveCodeAIPlannerOutputTokenBudget } from "../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js";

const runtimeSource = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

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

test("new multi-file implementation gets enough output budget for complete file contents", () => {
  assert.equal(resolveCodeAIPlannerOutputTokenBudget({
    state: {},
    action_policy: {
      implementation_required: true,
      mutation_first_required: true,
      allowed_actions: ["apply_files", "replace_range"],
    },
    allowed_edit_paths: ["index.html", "styles.css", "build.mjs"],
  }), 4096);
});

test("structured JSON repair with a concrete edit target is not truncated to discovery budget", () => {
  assert.equal(resolveCodeAIPlannerOutputTokenBudget({
    state: {},
    action_policy: { implementation_required: true },
    allowed_edit_paths: ["index.html"],
    compact_json_only: true,
  }), 2600);
});

test("multi-file structured JSON repair preserves full coherent implementation budget", () => {
  assert.equal(resolveCodeAIPlannerOutputTokenBudget({
    state: {},
    action_policy: { implementation_required: true },
    allowed_edit_paths: ["index.html", "styles.css", "build.mjs"],
    compact_json_only: true,
  }), 4096);
});


test("multi-file implementation is sequenced one declared file per reasoning pass", () => {
  assert.match(runtimeSource, /const sequentialImplementationTargetPath/);
  assert.match(runtimeSource, /remainingAllowedEditPaths\[0\]/);
  assert.match(runtimeSource, /SEQUENCED IMPLEMENTATION:/);
  assert.match(runtimeSource, /edit exactly one remaining controller-declared file in this pass/);
  assert.match(runtimeSource, /Do not mutate another declared file in the same reasoning response/);
  assert.match(runtimeSource, /controller will continue with the next remaining target/);
});

test("planner examples never advertise mutation while the current action phase forbids mutation", () => {
  assert.match(runtimeSource, /const mutationAllowedThisCall = list\(actionPolicy\.allowed_actions\)\.some/);
  assert.match(runtimeSource, /const outputExample = effectiveImplementationRequired && mutationAllowedThisCall/);
  assert.match(runtimeSource, /effectiveImplementationRequired === true &&\s*mutationAllowedThisCall === true/);
  assert.match(runtimeSource, /PRE-EDIT INSPECTION IS REQUIRED/);
  assert.match(runtimeSource, /Allowed package actions for THIS call/);
});
