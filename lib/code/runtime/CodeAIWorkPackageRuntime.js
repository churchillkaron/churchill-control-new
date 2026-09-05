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
import {
  retrieveCodeAIVerifiedEngineeringMemory,
  formatCodeAIVerifiedEngineeringMemoryForObjective,
  CODE_AI_VERIFIED_ENGINEERING_MEMORY_CONTRACT,
} from "./CodeAIVerifiedEngineeringMemoryRuntime.js";
import {
  recordCodeAIEngineeringMemoryUtility,
  CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
} from "./CodeAIEngineeringMemoryUtilityRuntime.js";

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

function engineeringMemoryUnavailable(error) {
  return {
    contract: CODE_AI_VERIFIED_ENGINEERING_MEMORY_CONTRACT,
    evaluated: false,
    matches: [],
    count: 0,
    reason: "ENGINEERING_MEMORY_UNAVAILABLE",
    failure_reason: text(error?.message || error, 500) || null,
    current_head_revalidation_required: true,
    patch_replay_allowed: false,
    raw_patch_returned: false,
    raw_source_returned: false,
    raw_reasoning_returned: false,
    automatic_knowledge_promotion: false,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
  };
}

async function resolveVerifiedEngineeringMemory(input, state) {
  if (object(state).verified_engineering_memory?.contract) {
    return object(state).verified_engineering_memory;
  }
  try {
    return await retrieveCodeAIVerifiedEngineeringMemory({
      context: object(input.context),
      objective: input.objective,
      repositoryUrl: input.repository_url,
      ref: input.ref || "main",
      excludeMissionId: state?.mission_id || null,
      limit: 3,
    });
  } catch (error) {
    return engineeringMemoryUnavailable(error);
  }
}

function stateWithEngineeringMemory(state, memory) {
  const source = object(state);
  const now = new Date().toISOString();
  const matches = list(memory?.matches).slice(0, 3);
  return {
    ...source,
    verified_engineering_memory: {
      contract:
        text(memory?.contract, 180) || CODE_AI_VERIFIED_ENGINEERING_MEMORY_CONTRACT,
      evaluated: memory?.evaluated === true,
      count: Number(memory?.count || matches.length || 0),
      matches,
      utility_contract:
        text(memory?.utility_contract, 180) || CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
      utility_adjusted_ranking: memory?.utility_adjusted_ranking === true,
      suppressed_candidate_count: Number(memory?.suppressed_candidate_count || 0),
      current_head_revalidation_required: true,
      patch_replay_allowed: false,
      automatic_knowledge_promotion: false,
      authorization_effect: "NONE",
      commit_authority: false,
      production_deploy_authority: false,
    },
    evidence: [
      ...list(source.evidence),
      {
        at: now,
        kind: "verified_engineering_memory",
        contract:
          text(memory?.contract, 180) || CODE_AI_VERIFIED_ENGINEERING_MEMORY_CONTRACT,
        utility_contract:
          text(memory?.utility_contract, 180) || CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
        status: matches.length ? "relevant_verified_history_found" : "no_relevant_verified_history",
        match_count: matches.length,
        prior_mission_ids: matches.map((match) => text(match?.mission_id, 240)).filter(Boolean),
        utility_adjusted_ranking: memory?.utility_adjusted_ranking === true,
        suppressed_candidate_count: Number(memory?.suppressed_candidate_count || 0),
        current_head_revalidation_required: true,
        patch_replay_allowed: false,
        automatic_knowledge_promotion: false,
        authorization_effect: "NONE",
        source_mutation_performed: false,
        provider_execution_submitted: false,
      },
    ].slice(-MAX_EVIDENCE_ITEMS),
  };
}

function objectiveWithEngineeringMemory(objective, memory) {
  const formatted = formatCodeAIVerifiedEngineeringMemoryForObjective(memory);
  if (!formatted) return text(objective, 12000);
  return [text(objective, 9000), formatted].filter(Boolean).join("\n\n");
}

async function safeClaimOwnerIntervention(input, missionId) {
  if (!missionId) return null;
  try {
    const claimed = await claimPendingCodeAIOwnerIntervention({
      context: object(input.context),
      missionId,
    });
    return claimed?.intervention || null;
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_OWNER_INTERVENTION_LOOKUP_FAILED",
      mission_id: missionId,
      reason: text(error?.message || error, 500),
      code_execution_blocked: false,
      intervention_claimed: false,
      source_mutation_performed: false,
      authorization_effect: "NONE",
    }));
    return null;
  }
}

async function safeRecordEngineeringMemoryUtility(context, result) {
  try {
    return await recordCodeAIEngineeringMemoryUtility({
      context: object(context),
      result,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_ENGINEERING_MEMORY_UTILITY_RECORD_FAILED",
      mission_id: text(result?.state?.mission_id, 240) || null,
      reason: text(error?.message || error, 500),
      code_execution_blocked: false,
      code_execution_result_changed: false,
      authorization_effect: "NONE",
    }));
    return {
      contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
      applicable: false,
      written: 0,
      observations: [],
      reason: "UTILITY_RECORD_UNAVAILABLE",
      failure_reason: text(error?.message || error, 500) || null,
      code_execution_result_changed: false,
      authorization_effect: "NONE",
    };
  }
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
  const memoryAlreadyBound = Boolean(resumeState.verified_engineering_memory?.contract);
  const memory = await resolveVerifiedEngineeringMemory(input, resumeState);
  let workingState = memoryAlreadyBound
    ? resumeState
    : stateWithEngineeringMemory(resumeState, memory);
  let workingObjective = memoryAlreadyBound
    ? text(input.objective, 12000)
    : objectiveWithEngineeringMemory(input.objective, memory);

  const intervention = await safeClaimOwnerIntervention(input, missionId);
  if (intervention?.instruction) {
    workingObjective = ownerSteeringObjective(workingObjective, intervention);
    workingState = stateWithAppliedOwnerIntervention(workingState, intervention);
  }

  const strategicResult = await executeCodeAIStrategicBatchedMission({
    ...input,
    objective: workingObjective,
    resume_state: workingState,
  });
  const result = {
    ...object(strategicResult),
    verified_engineering_memory:
      strategicResult?.state?.verified_engineering_memory || workingState.verified_engineering_memory || null,
  };
  const utility = await safeRecordEngineeringMemoryUtility(input.context, result);
  return {
    ...result,
    engineering_memory_utility: utility,
  };
}

export const CodeAIWorkPackageRuntime = Object.freeze({
  ...CodeAIWorkPackageDeterministicConvergenceRuntime,
  execute: executeBatchedAutonomousCodeMission,
  strategic_reasoning_contract: CODE_AI_STRATEGIC_REASONING_CONTRACT,
  strategic_reasoning: true,
  verified_engineering_memory_contract: CODE_AI_VERIFIED_ENGINEERING_MEMORY_CONTRACT,
  verified_engineering_memory: true,
  verified_engineering_memory_current_head_revalidation_required: true,
  verified_engineering_memory_patch_replay_allowed: false,
  engineering_memory_utility_contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
  engineering_memory_utility_recording: true,
  engineering_memory_utility_failure_blocks_code: false,
  owner_intervention_contract: CODE_AI_OWNER_INTERVENTION_CONTRACT,
  owner_intervention_safe_boundary: true,
  owner_intervention_starts_second_mission: false,
  owner_intervention_lookup_failure_blocks_code: false,
  deterministic_convergence_execute:
    executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
  control_contract: CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  max_package_operations: CodeAIWorkPackageCoreRuntime.max_package_operations,
  allowed_package_actions: CodeAIWorkPackageCoreRuntime.allowed_package_actions,
  implementation_actions: CodeAIWorkPackageCoreRuntime.implementation_actions,
});

export default CodeAIWorkPackageRuntime;
