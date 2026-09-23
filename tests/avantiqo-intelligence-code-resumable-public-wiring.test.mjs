import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CAPABILITY = "lib/platform/capabilities/createCodeAIAutonomousCapability.js";
const PREPARATION = "lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionPreparationRuntime.js";
const CODE_MISSION = "lib/code/runtime/CodeAIMissionRuntime.js";

const [capability, preparation, codeMission] = await Promise.all([
  readFile(CAPABILITY, "utf8"),
  readFile(PREPARATION, "utf8"),
  readFile(CODE_MISSION, "utf8"),
]);

function markers(source, expected) {
  for (const marker of expected) {
    assert.ok(source.includes(marker), `missing marker: ${marker}`);
  }
}

test("public Code can prepare one unified mission and carry it through an attested resume capsule", () => {
  markers(capability, [
    "intelligence_mission_preparation",
    "prepareAvantiqoIntelligenceCodeMission",
    "createAvantiqoIntelligenceCodeMissionResumeCapsule",
    "inspectAvantiqoIntelligenceCodeMissionResumeCapsule",
    "bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState",
    'route: "ATTESTED_RESUME_CAPSULE_REUSED"',
    'route: "REPREPARED_AFTER_REPOSITORY_MOVE"',
    "repeated_learning_or_general_for_ordinary_resume: false",
    "attestCodeMissionState",
  ]);

  const scopeIndex = capability.indexOf("assertResumeScope(payload.resume_state, context)");
  const resolveIndex = capability.indexOf("const unified = await resolveUnifiedMission");
  const bindCapsuleIndex = capability.indexOf(
    "stateForAttestation = bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState",
  );
  const attestIndex = capability.indexOf("result.state = attestCodeMissionState");
  assert.ok(scopeIndex >= 0 && resolveIndex > scopeIndex,
    "resume state attestation/scope must be verified before capsule reuse");
  assert.ok(bindCapsuleIndex >= 0 && attestIndex > bindCapsuleIndex,
    "capsule must be rebound before returned Code state is attested");
});

test("ordinary same-head resume bypasses repeated preparation while stale resume re-prepares", () => {
  const reuseIndex = capability.indexOf("if (resumeInspection.reusable === true)");
  const staleIndex = capability.indexOf("if (resumeInspection.reprepare_required === true)");
  const suppliedIndex = capability.indexOf("if (Object.keys(suppliedContext).length)");
  const requestIndex = capability.indexOf("if (request)", suppliedIndex);
  assert.ok(reuseIndex >= 0);
  assert.ok(staleIndex > reuseIndex);
  assert.ok(suppliedIndex > staleIndex);
  assert.ok(requestIndex > suppliedIndex);

  const reuseBlock = capability.slice(reuseIndex, staleIndex);
  assert.equal(reuseBlock.includes("prepareAvantiqoIntelligenceCodeMission({"), false,
    "same-head resume must not re-run mission preparation");

  const staleBlock = capability.slice(staleIndex, suppliedIndex);
  assert.ok(staleBlock.includes("prepareAvantiqoIntelligenceCodeMission({"),
    "stale capsule must re-prepare against moved repository state");
});

test("capsule persists decision products without raw reasoning, source or authorization", () => {
  markers(preparation, [
    "AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_V1",
    "prepared_context_can_resume_without_repeating_learning: true",
    "prepared_context_can_resume_without_repeating_general: true",
    "general_reasoning_repeat_without_repository_change: false",
    "repository_move_requires_repreparation: true",
    "raw_reasoning_persisted: false",
    "source_code_persisted: false",
    "patch_persisted_by_capsule: false",
    'authorization_effect: "NONE"',
  ]);
});

test("missing planned repository reads deterministically recover tracked paths before replanning", () => {
  markers(codeMission, [
    "function missingRepositoryReadPath",
    "function missingReadPathQueries",
    "async function recoverMissingRepositoryRead",
    'workspace.search({ mode: "path", query })',
    'kind: "missing_repository_read_path_discovery"',
    'kind: "missing_repository_read_path_recovered"',
    "full_replan_required: false",
    'state.status = "replan_required"',
    'kind: "missing_repository_read_path"',
    '"CODE_AI_MISSING_READ_PATH_REPLAN_REQUIRED"',
  ]);
  const readCaseIndex = codeMission.indexOf('case "read":');
  const recoveryCallIndex = codeMission.indexOf(
    "recoverMissingRepositoryRead(workspace, operation, state, controlContext, error)",
    readCaseIndex,
  );
  const missingReadIndex = codeMission.indexOf(
    "const missingReadPath = missingRepositoryReadPath(operation, error)",
  );
  const replanIndex = codeMission.indexOf('state.status = "replan_required"', missingReadIndex);
  assert.ok(readCaseIndex >= 0 && recoveryCallIndex > readCaseIndex,
    "a missing read must attempt deterministic tracked-path recovery in the same operation");
  assert.ok(missingReadIndex >= 0 && replanIndex > missingReadIndex,
    "ambiguous or absent candidates may replan only after deterministic discovery has failed");
});

test("existing low-level Code concurrency guard remains the repository-move trigger", () => {
  markers(codeMission, [
    "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
    'state.status = "replan_required"',
    "previous_base_commit: previousBase",
    "current_base_commit: workspace.base_commit",
  ]);
  const movementIndex = codeMission.indexOf(
    "if (state.base_commit && state.base_commit !== workspace.base_commit)",
  );
  const operationLoopIndex = codeMission.indexOf("for (const operation of plan)", movementIndex);
  assert.ok(movementIndex >= 0);
  assert.ok(operationLoopIndex === -1 || operationLoopIndex > movementIndex,
    "repository movement must be handled before planned Code operations execute");
});
