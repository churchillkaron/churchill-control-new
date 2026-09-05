import {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  parseCodeAIWorkPackage,
  compactCodeAIMissionStateForPlanner,
  resolveCodeAIWorkPackageActionPolicy,
  CodeAIWorkPackageCoreRuntime,
} from "./CodeAIWorkPackageCoreRuntime.js";
import {
  executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
  CodeAIWorkPackageDeterministicConvergenceRuntime,
} from "./CodeAIWorkPackageDeterministicConvergenceRuntime.js";
import {
  executeCodeAIStrategicBatchedMission,
  CodeAIStrategicReasoningRuntime,
  CODE_AI_STRATEGIC_REASONING_CONTRACT,
} from "./CodeAIStrategicReasoningRuntime.js";
import {
  claimPendingCodeAIOwnerIntervention,
  CODE_AI_OWNER_INTERVENTION_CONTRACT,
} from "./CodeAIOwnerInterventionRuntime.js";

const MAX_EVIDENCE_ITEMS = 120;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function ownerSteeringObjective(objective, intervention) {
  const instruction = text(intervention?.instruction, 2000);
  if (!instruction) return text(objective, 12000);
  return [
    text(objective, 10000),
    "LATEST OWNER STEERING. This instruction was submitted after the mission started and has been claimed at a governed safe engineering boundary.",
    instruction,
    "Apply the steering to this same mission. Preserve already-correct verified work unless the instruction requires changing it. Do not restart satisfied investigation, do not create a second mission, and run fresh verification after any resulting source mutation. This steering has no commit or deployment authority.",
  ].filter(Boolean).join("\n\n");
}

function stateWithAppliedOwnerIntervention(state, intervention) {
  const source = object(state);
  const instruction = text(intervention?.instruction, 2000);
  const now = new Date().toISOString();
  return {
    ...source,
    status: "running",
    blockers: [],
    current_operation_id: null,
    updated_at: now,
    owner_intervention: {
      contract:
        text(intervention?.contract, 180) || CODE_AI_OWNER_INTERVENTION_CONTRACT,
      action: text(intervention?.action, 80) || "STEER",
      instruction,
      applied_at: text(intervention?.applied_at, 120) || now,
      authorization_effect: "NONE",
      commit_authority: false,
      production_deploy_authority: false,
    },
    evidence: [
      ...list(source.evidence),
      {
        at: now,
        kind: "owner_intervention",
        contract:
          text(intervention?.contract, 180) || CODE_AI_OWNER_INTERVENTION_CONTRACT,
        action: text(intervention?.action, 80) || "STEER",
        instruction,
        status: "applied_at_safe_boundary",
        authorization_effect: "NONE",
        commit_authority: false,
        production_deploy_authority: false,
        source_mutation_performed: false,
        provider_execution_submitted: false,
      },
    ].slice(-MAX_EVIDENCE_ITEMS),
  };
}

export {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  CODE_AI_STRATEGIC_REASONING_CONTRACT,
  parseCodeAIWorkPackage,
  compactCodeAIMissionStateForPlanner,
  resolveCodeAIWorkPackageActionPolicy,
  CodeAIWorkPackageCoreRuntime,
  CodeAIStrategicReasoningRuntime,
};

export async function executeBatchedAutonomousCodeMission(input = {}) {
  const resumeState = object(input.resume_state);
  const missionId = text(resumeState.mission_id, 240);
  if (!missionId) {
    return executeCodeAIStrategicBatchedMission(input);
  }

  const claimed = await claimPendingCodeAIOwnerIntervention({
    context: object(input.context),
    missionId,
  });
  const intervention = claimed?.intervention || null;
  if (!intervention?.instruction) {
    return executeCodeAIStrategicBatchedMission(input);
  }

  return executeCodeAIStrategicBatchedMission({
    ...input,
    objective: ownerSteeringObjective(input.objective, intervention),
    resume_state: stateWithAppliedOwnerIntervention(resumeState, intervention),
  });
}

export const CodeAIWorkPackageRuntime = Object.freeze({
  ...CodeAIWorkPackageDeterministicConvergenceRuntime,
  execute: executeBatchedAutonomousCodeMission,
  strategic_reasoning_contract: CODE_AI_STRATEGIC_REASONING_CONTRACT,
  strategic_reasoning: true,
  owner_intervention_contract: CODE_AI_OWNER_INTERVENTION_CONTRACT,
  owner_intervention_safe_boundary: true,
  owner_intervention_starts_second_mission: false,
  deterministic_convergence_execute:
    executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
  control_contract: CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  max_package_operations: CodeAIWorkPackageCoreRuntime.max_package_operations,
  allowed_package_actions: CodeAIWorkPackageCoreRuntime.allowed_package_actions,
  implementation_actions: CodeAIWorkPackageCoreRuntime.implementation_actions,
});

export default CodeAIWorkPackageRuntime;
