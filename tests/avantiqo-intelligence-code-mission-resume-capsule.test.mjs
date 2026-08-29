import assert from "node:assert/strict";
import test from "node:test";

import {
  createAvantiqoIntelligenceCodeMissionContext,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js";
import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT,
  bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState,
  createAvantiqoIntelligenceCodeMissionResumeCapsule,
  inspectAvantiqoIntelligenceCodeMissionResumeCapsule,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionPreparationRuntime.js";
import {
  attestCodeMissionState,
  verifyCodeMissionStateAttestation,
} from "../lib/code/runtime/CodeMissionAttestationRuntime.js";

const HEAD_A = "a".repeat(40);
const HEAD_B = "b".repeat(40);
const SECRET = "resume-capsule-test-secret-0123456789abcdef";

function missionContext() {
  return createAvantiqoIntelligenceCodeMissionContext({
    mission: {
      id: "mission-resume-capsule",
      objective: "Repair the shared Intelligence Code resume lifecycle.",
      business_intent: "Avoid duplicate expensive reasoning while preserving current-repository authority.",
    },
    complexity_class: "medium",
    repository_context: {
      repository_url: "https://github.com/churchillkaron/churchill-control-new.git",
      ref: "main",
      head_sha: HEAD_A,
      observed_at: "2026-08-29T00:00:00.000Z",
    },
    learned_knowledge: {
      evaluated: true,
      status: "NO_RELEVANT_VERIFIED_KNOWLEDGE",
      knowledge: [],
      freshness_checked: true,
      evidence_graph_checked: true,
      fresh_research_performed: false,
    },
  });
}

function codeState(baseCommit = HEAD_A) {
  return {
    contract: "AVANTIQO_CODE_AI_MISSION_V1",
    mission_id: "code-mission-resume-capsule",
    objective: "Repair the shared Intelligence Code resume lifecycle.",
    repository_url: "https://github.com/churchillkaron/churchill-control-new.git",
    ref: "main",
    base_commit: baseCommit,
    status: "worker_warming",
    evidence: [],
    files_changed: [],
    source_changes: [],
    tests: [],
    failures: [],
    repairs: [],
    blockers: [],
    verification: [],
  };
}

test("prepared mission capsule is reusable while repository base is unchanged", () => {
  const capsule = createAvantiqoIntelligenceCodeMissionResumeCapsule({
    mission_context: missionContext(),
    source: "TEST_PREPARED_CONTEXT",
  });
  assert.equal(capsule.contract, AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT);
  assert.equal(capsule.prepared_repository_head, HEAD_A);
  assert.equal(capsule.reprepare_required, false);

  const state = bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState({
    state: codeState(HEAD_A),
    capsule,
  });
  const inspected = inspectAvantiqoIntelligenceCodeMissionResumeCapsule({
    resume_state: state,
  });
  assert.equal(inspected.present, true);
  assert.equal(inspected.reusable, true);
  assert.equal(inspected.reprepare_required, false);
  assert.equal(inspected.governance.repeat_learning_required, false);
  assert.equal(inspected.governance.repeat_general_required, false);
});

test("repository movement marks prepared capsule stale and requires one re-preparation", () => {
  const capsule = createAvantiqoIntelligenceCodeMissionResumeCapsule({
    mission_context: missionContext(),
  });
  const movedState = bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState({
    state: codeState(HEAD_B),
    capsule,
  });
  assert.equal(movedState.intelligence_mission_resume_capsule.status, "STALE_REPREPARE_REQUIRED");
  assert.equal(movedState.intelligence_mission_resume_capsule.reprepare_required, true);

  const inspected = inspectAvantiqoIntelligenceCodeMissionResumeCapsule({
    resume_state: movedState,
  });
  assert.equal(inspected.reusable, false);
  assert.equal(inspected.reprepare_required, true);
  assert.equal(inspected.reprepare_request.complexity_class, "medium");
  assert.equal(inspected.reprepare_request.repository_url,
    "https://github.com/churchillkaron/churchill-control-new.git");
  assert.equal(inspected.governance.repeat_learning_required, true);
  assert.equal(inspected.governance.repeat_general_required, false);
});

test("Code state attestation covers the complete resume capsule", () => {
  const capsule = createAvantiqoIntelligenceCodeMissionResumeCapsule({
    mission_context: missionContext(),
  });
  const state = bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState({
    state: codeState(HEAD_A),
    capsule,
  });
  const attested = attestCodeMissionState(state, {
    env: { AVANTIQO_CODE_MISSION_ATTESTATION_SECRET: SECRET },
  });
  assert.equal(verifyCodeMissionStateAttestation(attested, {
    env: { AVANTIQO_CODE_MISSION_ATTESTATION_SECRET: SECRET },
  }), true);

  const tampered = structuredClone(attested);
  tampered.intelligence_mission_resume_capsule.prepared_repository_head = HEAD_B;
  assert.throws(
    () => verifyCodeMissionStateAttestation(tampered, {
      env: { AVANTIQO_CODE_MISSION_ATTESTATION_SECRET: SECRET },
    }),
    /CODE_AI_MISSION_ATTESTATION_INVALID/,
  );
});

test("capsule rejects mission/repository lineage conflicts", () => {
  const context = missionContext();
  assert.throws(
    () => createAvantiqoIntelligenceCodeMissionResumeCapsule({
      mission_context: context,
      preparation_request: {
        mission: {
          id: context.mission.id,
          objective: "Different objective",
        },
        complexity_class: "medium",
        repository_url: context.repository_context.repository_url,
        ref: "main",
      },
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_OBJECTIVE_MISMATCH/,
  );
});
