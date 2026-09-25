import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const local = await readFile("lib/code/runtime/CodeWorkspaceLocalRuntime.js", "utf8");
const router = await readFile("lib/code/runtime/CodeWorkspaceRuntime.js", "utf8");
const mission = await readFile("lib/code/runtime/CodeAIMissionRuntime.js", "utf8");
const autonomous = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");

test("local workspaces expose bounded reusable sessions with identity and patch guards", () => {
  assert.match(local, /LOCAL_SESSION_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(local, /session_id: sessionId/);
  assert.match(local, /export async function attachLocalCodeWorkspace/);
  assert.match(local, /CODE_AI_LOCAL_SESSION_REPOSITORY_MISMATCH/);
  assert.match(local, /CODE_AI_LOCAL_SESSION_REF_MISMATCH/);
  assert.match(local, /CODE_AI_LOCAL_SESSION_BASE_COMMIT_MISMATCH/);
  assert.match(local, /CODE_AI_LOCAL_SESSION_PATCH_MISMATCH/);
  assert.match(local, /export async function closeLocalCodeWorkspaceSession/);
});

test("workspace router reattaches local sessions and can explicitly close them", () => {
  assert.match(router, /target === "LOCAL_COMPUTER" && input\.session_id/);
  assert.match(router, /workspace = await runtime\.attach\(input\)/);
  assert.match(router, /CODE_AI_LOCAL_SESSION_NOT_FOUND/);
  assert.match(router, /export async function closeCodeWorkspaceSession/);
  assert.match(router, /closeSession: closeCodeWorkspaceSession/);
});

test("mission runtime preserves local session only when explicitly requested", () => {
  assert.match(mission, /local_session_id = null/);
  assert.match(mission, /preserve_workspace_session = false/);
  assert.match(mission, /state\.local_session_id = text\(workspace\.session_id\)/);
  assert.match(mission, /preserveLocalWorkspace/);
  assert.match(mission, /if \(!device_session_id && !preserveLocalWorkspace\) await workspace\.stop\(\)/);
});

test("autonomous runtime reuses local session across work and closes terminal sessions", () => {
  assert.match(autonomous, /preserve_workspace_session:[\s\S]*workspace_target === "LOCAL_COMPUTER"/);
  assert.match(autonomous, /local_session_id:[\s\S]*state\?\.local_session_id/);
  assert.match(autonomous, /async function closeAutonomousLocalSession/);
  assert.match(autonomous, /result\?\.status !== "planner_pending"/);
  assert.match(autonomous, /closeCodeWorkspaceSession/);
});
