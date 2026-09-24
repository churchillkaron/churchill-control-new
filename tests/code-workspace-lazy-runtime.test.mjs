import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  codeWorkspaceLocalCommandPolicy,
  codeWorkspaceUniversalCommandPolicy,
} from "../lib/code/runtime/CodeWorkspaceCommandPolicyRuntime.js";
import { localCodeWorkspaceCommandPolicy } from "../lib/code/runtime/CodeWorkspaceLocalRuntime.js";

test("workspace router lazy-loads heavy implementations", async () => {
  const source = await readFile("lib/code/runtime/CodeWorkspaceRuntime.js", "utf8");
  assert.doesNotMatch(source, /^import .*CodeWorkspaceSandboxRuntime/m);
  assert.doesNotMatch(source, /^import .*CodeWorkspaceDeviceRuntime/m);
  assert.match(source, /import\("\.\/CodeWorkspaceSandboxRuntime\.js"\)/);
  assert.match(source, /import\("\.\/CodeWorkspaceDeviceRuntime\.js"\)/);
  assert.match(source, /import\("\.\/CodeWorkspaceLocalRuntime\.js"\)/);
});

test("shared local policy preserves local runtime command decisions", () => {
  const samples = [
    { command: "node", args: ["--test", "tests/example.test.mjs"] },
    { command: "git", args: ["status", "--short"] },
    { command: "git", args: ["push", "origin", "main"] },
    { command: "curl", args: ["https://example.com"] },
    { command: "unknown-tool", args: ["x"] },
    { command: "npm", args: ["run", "build"] },
    { command: "npm", args: ["publish"] },
  ];
  for (const sample of samples) {
    const shared = codeWorkspaceLocalCommandPolicy(sample);
    const runtime = localCodeWorkspaceCommandPolicy(sample);
    assert.equal(shared.allowed, runtime.allowed, JSON.stringify(sample));
    assert.equal(shared.reason, runtime.reason, JSON.stringify(sample));
  }
});

test("universal policy remains stricter than local execution policy for deployment-like commands", () => {
  const input = { command: "npm", args: ["run", "deploy"] };
  assert.equal(codeWorkspaceUniversalCommandPolicy(input).allowed, false);
  assert.equal(codeWorkspaceLocalCommandPolicy(input).allowed, true);
});

test("workspace policies permit only the exact isolated Next.js build environment", () => {
  const exact = {
    command: "npm",
    args: ["run", "build"],
    env: { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" },
  };
  assert.equal(codeWorkspaceUniversalCommandPolicy(exact).allowed, true);
  assert.equal(codeWorkspaceLocalCommandPolicy(exact).allowed, true);
  assert.equal(localCodeWorkspaceCommandPolicy(exact).allowed, true);

  for (const input of [
    { command: "npm", args: ["run", "build"], env: { AVANTIQO_NEXT_DIST_DIR: ".wrong" } },
    { command: "npm", args: ["run", "build"], env: { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify", EXTRA: "1" } },
    { command: "node", args: ["--version"], env: { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" } },
    { command: "npm", args: ["run", "test"], env: { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" } },
    { command: "env", args: ["AVANTIQO_NEXT_DIST_DIR=.next-code-verify", "npm", "run", "build"] },
    { command: "/usr/bin/env", args: ["AVANTIQO_NEXT_DIST_DIR=.next-code-verify", "npm", "run", "build"] },
    { command: "/bin/rm", args: ["-rf", "/tmp/unsafe"] },
    { command: "/usr/bin/python3", args: ["--version"] },
    { command: "../outside-tool", args: [] },
    { command: "node", args: ["/tmp/outside.js"] },
    { command: "python3", args: ["../outside.py"] },
    { command: "git", args: ["-C", "/tmp/outside-repo", "status"] },
    { command: "npm", args: ["--prefix=/tmp/outside-app", "test"] },
    { command: "node", args: ["file:///tmp/outside.mjs"] },
    { command: "node", args: ["C:\\outside\\tool.js"] },
  ]) {
    assert.equal(codeWorkspaceUniversalCommandPolicy(input).allowed, false, JSON.stringify(input));
    assert.equal(codeWorkspaceLocalCommandPolicy(input).allowed, false, JSON.stringify(input));
    assert.equal(localCodeWorkspaceCommandPolicy(input).allowed, false, JSON.stringify(input));
  }
});
test("local command policy permits ordinary workspace-relative engineering arguments", () => {
  for (const input of [
    { command: "node", args: ["--test", "tests/example.test.mjs"] },
    { command: "git", args: ["status", "--short", "--", "src/example.js"] },
    { command: "python3", args: ["scripts/check.py"] },
    { command: "npm", args: ["run", "test"] },
    { command: "./scripts/local-check", args: ["src/example.js"] },
  ]) {
    assert.equal(codeWorkspaceLocalCommandPolicy(input).allowed, true, JSON.stringify(input));
    assert.equal(localCodeWorkspaceCommandPolicy(input).allowed, true, JSON.stringify(input));
  }
});
