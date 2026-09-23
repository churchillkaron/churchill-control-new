import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveCodeAIDeveloperVerificationRequest } from "../lib/code/runtime/CodeAIDeveloperVerificationRuntime.js";

const runtime = await readFile(new URL("../lib/code/runtime/CodeAIDeveloperVerificationRuntime.js", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");

test("explicit node check with no source changes uses developer verification lane", () => {
  const request = resolveCodeAIDeveloperVerificationRequest("Inspect app/api/auth/session/route.js in this exact shared workspace, verify it with node --check, and make no source changes. Do not commit or deploy.");
  assert.equal(request.eligible, true);
  assert.equal(request.file_path, "app/api/auth/session/route.js");
  assert.deepEqual(request.args, ["--check", "app/api/auth/session/route.js"]);
});

test("JSX read-only verification adapts node --check intent to ESLint", () => {
  const request = resolveCodeAIDeveloperVerificationRequest("Inspect components/creative/code/AvantiqoCodeIDE.jsx, run node --check on it, read-only verification only, and make no source changes.");
  assert.equal(request.eligible, true);
  assert.equal(request.file_path, "components/creative/code/AvantiqoCodeIDE.jsx");
  assert.equal(request.requested_verifier, "node --check");
  assert.equal(request.effective_verifier, "eslint");
  assert.equal(request.command, "npx");
  assert.deepEqual(request.args, ["eslint", "--no-warn-ignored", "components/creative/code/AvantiqoCodeIDE.jsx"]);
});

test("truncated exact-file node check still uses deterministic verification when no mutation verb is present", () => {
  const request = resolveCodeAIDeveloperVerificationRequest("Inspect components/creative/code/AvantiqoCodeIDE.jsx, run node --check on it,");
  assert.equal(request.eligible, true);
  assert.equal(request.file_path, "components/creative/code/AvantiqoCodeIDE.jsx");
  assert.equal(request.effective_verifier, "eslint");
});

test("mutation requests never enter developer verification lane", () => {
  const request = resolveCodeAIDeveloperVerificationRequest("Fix app/api/auth/session/route.js and verify it with node --check. Do not deploy.");
  assert.equal(request.eligible, false);
});

test("developer verification attaches exact DEVICE session and has no mutation authority", () => {
  assert.match(runtime, /session_id: sessionId/);
  assert.match(runtime, /acquireEditLease\(\{ owner: "CODE"/);
  assert.match(runtime, /workspace\.read/);
  assert.match(runtime, /workspace\.run/);
  assert.match(runtime, /workspace\.diff/);
  assert.doesNotMatch(runtime, /workspace\.applyFiles/);
  assert.doesNotMatch(runtime, /workspace\.ideWrite/);
  assert.match(runtime, /source_mutation_performed: false/);
  assert.match(runtime, /shared_device_session_preserved: true/);
  assert.match(runtime, /mission_id = null/);
  assert.match(runtime, /const missionId = text\(mission_id, 240\)/);
  assert.match(runtime, /consumePendingCodeAIOwnerStopAtSafeBoundary/);
  assert.match(runtime, /ownerStopBoundary/);
  assert.match(runtime, /phase: "OWNER_STOPPED"/);
  assert.match(runtime, /phase: "DEVELOPER_VERIFY_READ"[\s\S]*file_path: request\.file_path/);
  assert.match(runtime, /phase: "DEVELOPER_VERIFY_COMMAND"[\s\S]*file_path: request\.file_path/);
  assert.match(runtime, /phase: "DEVELOPER_VERIFY_RESULT"[\s\S]*verification_passed: passed/);
  assert.match(runtime, /phase: "DEVELOPER_VERIFY_COMPLETE"[\s\S]*file_path: request\.file_path/);
});

test("mission route preserves device_session_id for fast and normal paths", () => {
  assert.match(route, /requestedDeviceSessionId = text\(body\.device_session_id/);
  assert.match(route, /runCodeAIDeveloperVerification/);
  assert.match(route, /device_session_id: requestedDeviceSessionId/);
  assert.match(route, /requestedMissionId = text\(body\.mission_id/);
  assert.match(route, /mission_id: missionId/);
});
