import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { codeWorkspaceCommandPolicy } from "../lib/code/runtime/CodeWorkspaceSandboxRuntime.js";

const blockedWorkspaceCommands = [
  { command: "git", args: ["push", "origin", "main"] },
  { command: "vercel", args: ["deploy", "--prod"] },
  { command: "npx", args: ["supabase", "db", "push"] },
  { command: "npm", args: ["publish"] },
  { command: "npm", args: ["run", "deploy"] },
];

const allowedWorkspaceCommands = [
  { command: "git", args: ["status", "--short"] },
  { command: "git", args: ["diff", "--check"] },
  { command: "npm", args: ["test"] },
  { command: "npm", args: ["run", "build"] },
  { command: "node", args: ["--test", "tests/example.test.mjs"] },
];

test("Code AI workspace blocks direct production and destructive commands", () => {
  for (const input of blockedWorkspaceCommands) {
    const decision = codeWorkspaceCommandPolicy(input);
    assert.equal(decision.allowed, false, JSON.stringify(input));
    assert.ok(decision.reason);
  }
});

test("Code AI workspace allows normal isolated development verification", () => {
  for (const input of allowedWorkspaceCommands) {
    const decision = codeWorkspaceCommandPolicy(input);
    assert.equal(decision.allowed, true, `${JSON.stringify(input)} => ${decision.reason}`);
  }
});

test("Code AI durable mission adds a second command boundary and concurrency guard", async () => {
  const source = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");
  for (const marker of [
    '"bash", "sh", "zsh", "fish", "env", "xargs"',
    "CODE_AI_MISSION_COMMAND_NOT_ALLOWED",
    "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
    "repair_required",
    "verification_required",
    "completed_operation_ids",
    "resume_patch",
  ]) {
    assert.ok(source.includes(marker), `missing ${marker}`);
  }
});
