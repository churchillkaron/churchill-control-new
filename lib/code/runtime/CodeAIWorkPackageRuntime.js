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
import {
  deriveCodeAIEngineeringSkills,
  formatCodeAIEngineeringSkillsForObjective,
  CODE_AI_ENGINEERING_SKILL_CONTRACT,
} from "./CodeAIEngineeringSkillRuntime.js";

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

function engineeringSkillsUnavailable(error) {
  return {
    contract: CODE_AI_ENGINEERING_SKILL_CONTRACT,
    evaluated: false,
    skills: [],
    count: 0,
    reason: "ENGINEERING_SKILLS_UNAVAILABLE",
    failure_reason: text(error?.message || error, 500) || null,
    dynamic_derivation: true,
    persisted_as_trusted_rule: false,
    current_head_revalidation_required: true,
    patch_replay_allowed: false,
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

async function resolveEngineeringSkills(input, state) {
  if (object(state).formed_engineering_skills?.contract) {
    return object(state).formed_engineering_skills;
  }
  try {
    return await deriveCodeAIEngineeringSkills({
      context: object(input.context),
      objective: input.objective,
      repositoryUrl: input.repository_url,
      ref: input.ref || "main",
      limit: 4,
    });
  } catch (error) {
    return engineeringSkillsUnavailable(error);
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

function stateWithEngineeringSkills(state, value) {
  const source = object(state);
  const now = new Date().toISOString();
  const skills = list(value?.skills).slice(0, 4);
  return {
    ...source,
    formed_engineering_skills: {
      contract: text(value?.contract, 180) || CODE_AI_ENGINEERING_SKILL_CONTRACT,
      evaluated: value?.evaluated === true,
      count: Number(value?.count || skills.length || 0),
      skills,
      positive_utility_sessions: Number(value?.positive_utility_sessions || 0),
      minimum_distinct_verified_missions:
        Number(value?.minimum_distinct_verified_missions || 2),
      dynamic_derivation: true,
      persisted_as_trusted_rule: false,
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
        kind: "formed_engineering_skills",
        contract: text(value?.contract, 180) || CODE_AI_ENGINEERING_SKILL_CONTRACT,
        status: skills.length ? "evidence_backed_skills_formed" : "no_skill_threshold_met",
        skill_count: skills.length,
        skill_ids: skills.map((skill) => text(skill?.skill_id, 120)).filter(Boolean),
        dynamic_derivation: true,
        persisted_as_trusted_rule: false,
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

function objectiveWithEngineeringSkills(objective, value) {
  const formatted = formatCodeAIEngineeringSkillsForObjective(value);
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
  const skillsAlreadyBound = Boolean(resumeState.formed_engineering_skills?.contract);
  const [memory, skills] = await Promise.all([
    resolveVerifiedEngineeringMemory(input, resumeState),
    resolveEngineeringSkills(input, resumeState),
  ]);
  let workingState = memoryAlreadyBound
    ? resumeState
    : stateWithEngineeringMemory(resumeState, memory);
  if (!skillsAlreadyBound) {
    workingState = stateWithEngineeringSkills(workingState, skills);
  }
  let workingObjective = memoryAlreadyBound
    ? text(input.objective, 12000)
    : objectiveWithEngineeringMemory(input.objective, memory);
  if (!skillsAlreadyBound) {
    workingObjective = objectiveWithEngineeringSkills(workingObjective, skills);
  }

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
    formed_engineering_skills:
      strategicResult?.state?.formed_engineering_skills || workingState.formed_engineering_skills || null,
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
  engineering_skill_contract: CODE_AI_ENGINEERING_SKILL_CONTRACT,
  dynamic_engineering_skill_formation: true,
  engineering_skill_persisted_as_trusted_rule: false,
  engineering_skill_current_head_revalidation_required: true,
  engineering_skill_patch_replay_allowed: false,
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
