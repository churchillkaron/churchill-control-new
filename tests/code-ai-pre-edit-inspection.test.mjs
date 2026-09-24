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
  assert.equal(loaded.mutation_first_required, true);
  assert.deepEqual(loaded.allowed_actions, ["apply_files", "replace_range"]);
  assert.ok(loaded.declared_evidence_paths.includes("app/api/orders/route.js"));
  assert.ok(loaded.declared_evidence_paths.includes("lib/orders/service.js"));

  const implemented = resolveCodeAIWorkPackageActionPolicy({
    objective_context,
    state: {
      evidence: [
        read("lib/orders/service.js"),
        read("app/api/orders/route.js"),
        { kind: "operation", action: "apply_files", status: "completed" },
      ],
      files_changed: ["app/api/orders/route.js"],
      source_changes: [{
        path: "app/api/orders/route.js",
        operation: "write",
        content: "export function POST(){ return Response.json({ok:true}); }",
      }],
    },
  });
  assert.equal(implemented.implementation_present, true);
  assert.equal(implemented.mutation_first_required, false);
  assert.deepEqual(implemented.allowed_actions, ["apply_files", "replace_range", "verify", "diff"]);
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

test("repair objective is implementation-required even before a verifier has failed", () => {
  const policy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: {
      owner_objective: "Fix the broken add(a,b) behavior so the existing tests pass.",
    },
    state: { evidence: [], files_changed: [], source_changes: [] },
  });
  assert.equal(policy.implementation_required, true);
});

test("explicit read-only objective never acquires mutation authority from wording alone", () => {
  const policy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: {
      owner_objective: "Read-only inspection. Do not modify files. Verify the current implementation.",
    },
    state: { evidence: [], files_changed: [], source_changes: [] },
  });
  assert.equal(policy.implementation_required, false);
});

test("repair objective may protect an existing test file without becoming read-only", () => {
  const policy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: {
      owner_objective: "Fix the broken add behavior. Do not modify the existing test file. Run the existing test after the repair.",
    },
    state: { evidence: [], files_changed: [], source_changes: [] },
  });
  assert.equal(policy.implementation_required, true);
});

test("pre-existing dirty source does not count as Code-owned implementation", () => {
  const policy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: {
      owner_objective: "Fix the broken add(a,b) behavior so the existing tests pass.",
    },
    state: {
      source_changes: [{ path: "tmp/code-worldclass-cert/math.js", operation: "write", content: "export function add(a,b){return a-b}" }],
      evidence: [],
    },
  });
  assert.equal(policy.implementation_present, false);
  assert.equal(policy.implementation_required, true);
});

test("completed mission-owned mutation can establish implementation presence", () => {
  const policy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: {
      owner_objective: "Fix the broken add(a,b) behavior so the existing tests pass.",
    },
    state: {
      source_changes: [{ path: "tmp/code-worldclass-cert/math.js", operation: "write", content: "export function add(a,b){return a+b}" }],
      evidence: [{
        kind: "operation",
        action: "apply_files",
        status: "completed",
      }],
    },
  });
  assert.equal(policy.implementation_present, true);
});
test("explicit target source evidence locks discovery and advances repair to implementation", () => {
  const policy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: {
      owner_objective: "Fix the broken add behavior.",
      allowed_edit_paths: ["src/math.js"],
      implementation_required: true,
    },
    state: {
      evidence: [read("src/math.js", "export const add=(a,b)=>a-b;")],
      files_changed: [],
      source_changes: [],
    },
  });
  assert.equal(policy.explicit_targets_loaded, true);
  assert.equal(policy.implementation_evidence_ready, true);
  assert.equal(policy.mutation_first_required, true);
  assert.equal(policy.discovery_locked, true);
  assert.deepEqual(policy.allowed_actions, ["apply_files", "replace_range"]);
});

test("explicit target does not lock discovery until every target is read", () => {
  const policy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: {
      owner_objective: "Refactor the shared email behavior.",
      allowed_edit_paths: ["src/email.js", "src/customers.js"],
      implementation_required: true,
    },
    state: {
      evidence: [read("src/email.js", "export const normalize=(x)=>x;")],
      files_changed: [],
      source_changes: [],
    },
  });
  assert.equal(policy.explicit_targets_loaded, false);
  assert.equal(policy.implementation_evidence_ready, false);
  assert.equal(policy.discovery_locked, false);
  assert.ok(policy.allowed_actions.includes("read"));
});

test("pre-edit inspection still blocks implementation even when explicit target is loaded", () => {
  const policy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: {
      owner_objective: "Fix the API behavior.",
      allowed_edit_paths: ["app/api/orders/route.js"],
      pre_edit_inspection_paths: ["lib/orders/service.js"],
      implementation_required: true,
    },
    state: {
      evidence: [read("app/api/orders/route.js", "export function POST(){}")],
      files_changed: [],
      source_changes: [],
    },
  });
  assert.equal(policy.explicit_targets_loaded, true);
  assert.equal(policy.pre_edit_inspection_loaded, false);
  assert.equal(policy.implementation_evidence_ready, false);
  assert.equal(policy.discovery_locked, false);
  assert.deepEqual(policy.allowed_actions.sort(), ["read", "search"]);
});

test("confirmed absent create targets satisfy declared evidence and unlock first mutation", () => {
  const targets = ["tmp/new-a.js", "tmp/new-b.js"];
  const evidence = targets.map((requested_path) => ({
    kind: "operation",
    action: "read",
    status: "completed",
    result: {
      expected_new_target: true,
      allowed_edit_target: true,
      requested_path,
      exists: false,
    },
  }));
  const policy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: {
      owner_objective: "Create tmp/new-a.js and tmp/new-b.js.",
      implementation_required: true,
      allowed_edit_paths: targets,
    },
    state: { evidence, files_changed: [], source_changes: [] },
  });
  assert.equal(policy.all_declared_evidence_loaded, false);
  assert.equal(policy.explicit_targets_loaded, true);
  assert.equal(policy.implementation_evidence_ready, true);
  assert.equal(policy.implementation_required, true);
  assert.equal(policy.mutation_blocked_by_declared_evidence, false);
  assert.equal(policy.mutation_first_required, true);
  assert.deepEqual(policy.allowed_actions, ["apply_files", "replace_range"]);
});
