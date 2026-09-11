import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const missionPath = new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url);
const mutationPath = new URL("../lib/code/runtime/CodeWorkspaceFileMutationRuntime.js", import.meta.url);

const missionSource = await readFile(missionPath, "utf8");
const mutationSource = await readFile(mutationPath, "utf8");

test("Code AI mission uses the shared workspace router instead of hardcoded sandbox", () => {
  assert.match(missionSource, /import \{ CodeWorkspaceRuntime \} from "\.\/CodeWorkspaceRuntime\.js";/);
  assert.match(missionSource, /CodeWorkspaceRuntime\.commandPolicy\(input\)/);
  assert.match(missionSource, /CodeWorkspaceRuntime\.open\(\{/);
  assert.doesNotMatch(missionSource, /CodeWorkspaceSandboxRuntime\.open\(/);
  assert.doesNotMatch(missionSource, /CodeWorkspaceSandboxRuntime\.commandPolicy\(/);
});

test("file mutation commands are rooted in the selected workspace", () => {
  assert.match(mutationSource, /cwd:\s*workspace\.repository_root/);
  assert.doesNotMatch(mutationSource, /const REPOSITORY_ROOT\s*=/);
  assert.doesNotMatch(mutationSource, /CodeWorkspaceSandboxRuntime/);
});
