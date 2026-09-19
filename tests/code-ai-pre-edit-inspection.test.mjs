import assert from "node:assert/strict";
import test from "node:test";

import {
  planCodeAIPreEditInspection,
  formatCodeAIPreEditInspectionForObjective,
} from "../lib/code/runtime/CodeAIPreEditInspectionRuntime.js";
import {
  resolveCodeAIWorkPackageActionPolicy,
} from "../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js";

function read(path, content = "export const observed = true;") {
  return {
    kind: "operation",
    action: "read",
    status: "completed",
    result: { file_path: path, content },
  };
}

test("pre-edit inspection promotes blast-radius service and API consumers before mutation", () => {
  const state = {
    files_changed: ["lib/orders/runtime.js"],
    source_changes: [{
      path: "lib/orders/runtime.js",
      operation: "write",
      content: "export function settleOrder(){ return true; }",
    }],
    evidence: [
      read("lib/orders/service.js", 'import { settleOrder } from "./runtime.js"; export function settle(){ return settleOrder(); }'),
      read("app/api/orders/route.js", 'import { settle } from "../../../lib/orders/service.js"; export function POST(){ return settle(); }'),
      read("tests/orders.integration.mjs", 'import { POST } from "../app/api/orders/route.js"; await POST();'),
    ],
  };
  const plan = planCodeAIPreEditInspection({ state });
  assert.equal(plan.required, true);
  assert.deepEqual(plan.required_paths, [
    "app/api/orders/route.js",
    "lib/orders/service.js",
  ]);
  assert.equal(plan.mutation_blocked_until_required_paths_loaded, true);
  assert.equal(plan.model_call_performed, false);
  assert.equal(plan.source_mutation_authority, false);
  const directive = formatCodeAIPreEditInspectionForObjective(plan);
  assert.match(directive, /inspect app\/api\/orders\/route\.js before mutation/);
  assert.match(directive, /compatibility evidence obligations, not edit targets/);
});

test("pre-edit inspection paths are hard evidence obligations in work-package action policy", () => {
  const objective_context = {
    pre_edit_inspection_paths: ["app/api/orders/route.js", "lib/orders/service.js"],
  };
  const missing = resolveCodeAIWorkPackageActionPolicy({
    objective_context,
    state: {
      evidence: [read("lib/orders/service.js")],
      source_changes: [],
    },
  });
  assert.equal(missing.all_declared_evidence_loaded, false);
  assert.equal(missing.implementation_required, false);
  assert.deepEqual(missing.allowed_actions, ["search", "read"]);
  assert.equal(missing.mutation_blocked_by_pre_edit_inspection, true);
  assert.equal(missing.pre_edit_inspection_loaded, false);

  const loaded = resolveCodeAIWorkPackageActionPolicy({
    objective_context,
    state: {
      evidence: [read("lib/orders/service.js"), read("app/api/orders/route.js")],
      source_changes: [],
    },
  });
  assert.equal(loaded.all_declared_evidence_loaded, true);
  assert.equal(loaded.implementation_required, true);
  assert.equal(loaded.pre_edit_inspection_loaded, true);
  assert.equal(loaded.mutation_blocked_by_pre_edit_inspection, false);
  assert.deepEqual(loaded.allowed_actions, ["apply_files", "verify", "diff"]);
  assert.ok(loaded.declared_evidence_paths.includes("app/api/orders/route.js"));
  assert.ok(loaded.declared_evidence_paths.includes("lib/orders/service.js"));
});

test("pre-edit inspection remains bounded and does not turn tests into edit evidence", () => {
  const evidence = [];
  let previous = "lib/core/runtime.js";
  for (let index = 0; index < 6; index += 1) {
    const current = `lib/layer-${index}.js`;
    const rel = index === 0 ? "./core/runtime.js" : `./layer-${index - 1}.js`;
    evidence.push(read(current, `import { value } from "${rel}"; export const value${index}=value;`));
    previous = current;
  }
  evidence.push(read("tests/deep.integration.mjs", 'import "../lib/layer-5.js";'));
  const plan = planCodeAIPreEditInspection({
    state: {
      files_changed: ["lib/core/runtime.js"],
      source_changes: [{ path: "lib/core/runtime.js", operation: "write", content: "export const value = 1;" }],
      evidence,
    },
  });
  assert.ok(plan.required_paths.length <= 4);
  assert.ok(plan.required_paths.every((path) => !path.startsWith("tests/")));
  assert.equal(plan.max_required_paths, 4);
});
