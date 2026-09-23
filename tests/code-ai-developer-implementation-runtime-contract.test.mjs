import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveCodeAIDeveloperImplementationRequest } from "../lib/code/runtime/CodeAIDeveloperImplementationRuntime.js";

const runtime = await readFile(new URL("../lib/code/runtime/CodeAIDeveloperImplementationRuntime.js", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");

test("exact-path bounded implementation is eligible", () => {
  const request = resolveCodeAIDeveloperImplementationRequest("Update components/creative/code/AvantiqoCodeIDE.jsx and create tests/avantiqo-code-ide-copy-path-contract.test.mjs. Do not commit or deploy.");
  assert.equal(request.eligible, true);
  assert.deepEqual(request.allowed_edit_paths, ["components/creative/code/AvantiqoCodeIDE.jsx", "tests/avantiqo-code-ide-copy-path-contract.test.mjs"]);
});

test("broad architecture work does not use bounded implementation lane", () => {
  const request = resolveCodeAIDeveloperImplementationRequest("Redesign the architecture across the platform and update components/creative/code/AvantiqoCodeIDE.jsx.");
  assert.equal(request.eligible, false);
  assert.equal(request.broad_or_strategic, true);
});

test("bounded implementation preserves exact DEVICE session and edit paths", () => {
  assert.match(runtime, /workspace_target: "DEVICE"/);
  assert.match(runtime, /device_session_id: sessionId/);
  assert.match(runtime, /allowed_edit_paths: request\.allowed_edit_paths/);
  assert.match(runtime, /strategic_council_skipped: true/);
  assert.match(runtime, /mission_id = null/);
  assert.match(runtime, /mission_id: text\(mission_id, 240\) \|\| null/);
  assert.match(route, /runCodeAIDeveloperImplementation/);
  assert.match(route, /mission_id: missionId/);
});


test("bounded implementation binds an existing target as required evidence before implementation", () => {
  assert.match(runtime, /evidencePath = request\.allowed_edit_paths\.find/);
  assert.match(runtime, /evidence_path_1: evidencePath/);
  assert.match(runtime, /required_evidence_path: evidencePath/);
});


test("bounded implementation carries explicit implementation-required controller flag", () => {
  assert.match(runtime, /implementation_required: true/);
});


test("bounded implementation resumes pending planner state in the same lane", () => {
  assert.match(runtime, /resume_state = null/);
  assert.match(runtime, /resume_state,/);
  assert.match(route, /resume_state: suppliedResumeState \|\| resumeState \|\| null/);
});


test("repair-required and verification-required states remain resumable in bounded Developer Mode", () => {
  assert.match(route, /\["planner_pending", "repair_required", "verification_required"\]\.includes/);
});


test("bounded implementation teaches direct Node test runtime conventions and allows repair headroom", () => {
  assert.match(runtime, /reasoning_call_budget = 12/);
  assert.match(runtime, /node:test/);
  assert.match(runtime, /node:assert\/strict/);
  assert.match(runtime, /Do not use Jest globals/);
  assert.match(runtime, /adaptive_reasoning_budget_applied: true/);
  assert.match(route, /Math\.min\(Math\.max\(reasoningCallBudget, 12\), 12\)/);
});


test("bounded route resumes state-level pending and repair statuses", () => {
  assert.match(route, /text\(result\?\.status \|\| result\?\.state\?\.status, 120\)/);
});


test("failed-verification repair prompt carries exact evidence and owner requirement", async () => {
  const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");
  assert.match(source, /EXACT FAILED VERIFICATION EVIDENCE/);
  assert.match(source, /ORIGINAL OWNER REQUIREMENT/);
  assert.match(source, /If a symbol is undefined/);
  assert.match(source, /existing helper\/function/);
});
