import test from "node:test";
import assert from "node:assert/strict";
import { planCodeAIDeterministicVerificationGates } from "../lib/code/runtime/CodeAIDeterministicVerificationPlanRuntime.js";
import { codeWorkspaceLocalCommandPolicy } from "../lib/code/runtime/CodeWorkspaceCommandPolicyRuntime.js";

function assertPlanExecutable(plan, label) {
  for (const operation of plan.operations || []) {
    const input = operation.input || {};
    const decision = codeWorkspaceLocalCommandPolicy({
      command: input.command,
      args: input.args || [],
      env: input.env || null,
    });
    assert.equal(
      decision.allowed,
      true,
      label + ": " + String(input.command || "") + " " + (input.args || []).join(" ") + " -> " + (decision.reason || "blocked"),
    );
  }
}

test("controller-generated JavaScript verification gates are executable under local policy", () => {
  const plan = planCodeAIDeterministicVerificationGates({
    state: {
      files_changed: ["lib/example.js"],
      source_changes: [{ path: "lib/example.js", operation: "write", content: "export const x = 1;\n" }],
      repository_guidance: {
        verification_commands_text: "package.json | test | test => node --test",
      },
      evidence: [],
      tests: [],
      verification: [],
    },
  });
  assertPlanExecutable(plan, "javascript");
});

test("controller-generated isolated Next build gate is executable with only its bounded env", () => {
  const plan = planCodeAIDeterministicVerificationGates({
    state: {
      files_changed: ["app/page.js", "lib/runtime.js"],
      source_changes: [
        { path: "app/page.js", operation: "write", content: "export default function Page(){return null;}\n" },
        { path: "lib/runtime.js", operation: "write", content: "export const x = 1;\n" },
      ],
      repository_guidance: {
        verification_commands_text: "package.json | build | build => next build\npackage.json | test | test => node --test",
      },
      evidence: [],
      tests: [],
      verification: [],
      world_class_quality: { risk: "high" },
    },
  });
  assertPlanExecutable(plan, "next-build");
  const build = (plan.operations || []).find((operation) =>
    operation.input?.command === "npm" &&
    operation.input?.args?.[0] === "run" &&
    operation.input?.args?.[1] === "build"
  );
  if (build) {
    assert.deepEqual(build.input.env, { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" });
  }
});
