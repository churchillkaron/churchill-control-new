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
  applyClaimedCodeAIOwnerIntervention,
  releaseClaimedCodeAIOwnerIntervention,
  CODE_AI_OWNER_INTERVENTION_CONTRACT,
  CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
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
import {
  governCodeAIEngineeringSkills,
  recordCodeAIEngineeringSkillLifecycleOutcome,
  CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
} from "./CodeAIEngineeringSkillLifecycleRuntime.js";

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

function time(value) {
  const parsed = Date.parse(text(value, 120));
  return Number.isFinite(parsed) ? parsed : 0;
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

function engineeringSkillLifecycleUnavailable(error, skillSet = {}) {
  return {
    ...object(skillSet),
    lifecycle_contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
    lifecycle_evaluated: false,
    lifecycle_failure_reason: text(error?.message || error, 500) || null,
    lifecycle_suppressed_count: 0,
    equivalent_skill_merge_count: 0,
    broad_skill_split_count: 0,
    direct_current_head_contradiction_required_for_decay: true,
    sha_movement_alone_causes_decay: false,
    dynamic_merge_split: true,
    persisted_as_trusted_rule: false,
    automatic_knowledge_promotion: false,
    authorization_effect: "NONE",
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
    const derived = await deriveCodeAIEngineeringSkills({
      context: object(input.context),
      objective: input.objective,
      repositoryUrl: input.repository_url,
      ref: input.ref || "main",
      limit: 4,
    });
    try {
      return await governCodeAIEngineeringSkills({
        context: object(input.context),
        skillSet: derived,
        repositoryUrl: input.repository_url,
        ref: input.ref || "main",
      });
    } catch (error) {
      console.error(JSON.stringify({
        event: "AVANTIQO_CODE_ENGINEERING_SKILL_LIFECYCLE_GOVERNANCE_FAILED",
        reason: text(error?.message || error, 500),
        code_execution_blocked: false,
        derived_skills_preserved: true,
        authorization_effect: "NONE",
      }));
      return engineeringSkillLifecycleUnavailable(error, derived);
    }
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
      lifecycle_contract:
        text(value?.lifecycle_contract, 180) || CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
      lifecycle_evaluated: value?.lifecycle_evaluated === true,
      lifecycle_suppressed_count: Number(value?.lifecycle_suppressed_count || 0),
      equivalent_skill_merge_count: Number(value?.equivalent_skill_merge_count || 0),
      broad_skill_split_count: Number(value?.broad_skill_split_count || 0),
      direct_current_head_contradiction_required_for_decay: true,
      sha_movement_alone_causes_decay: false,
      dynamic_merge_split: true,
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
        lifecycle_contract:
          text(value?.lifecycle_contract, 180) || CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
        status: skills.length ? "evidence_backed_skills_governed" : "no_skill_threshold_met",
        skill_count: skills.length,
        skill_ids: skills.map((skill) => text(skill?.skill_id, 120)).filter(Boolean),
        lifecycle_suppressed_count: Number(value?.lifecycle_suppressed_count || 0),
        equivalent_skill_merge_count: Number(value?.equivalent_skill_merge_count || 0),
        broad_skill_split_count: Number(value?.broad_skill_split_count || 0),
        direct_current_head_contradiction_required_for_decay: true,
        sha_movement_alone_causes_decay: false,
        dynamic_merge_split: true,
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

async function safeClaimOwnerIntervention(input, missionId, state) {
  if (!missionId) return { intervention: null, lookup_failed: false };
  try {
    const claimed = await claimPendingCodeAIOwnerIntervention({
      context: object(input.context),
      missionId,
      existingClaimId:
        text(state?.owner_intervention?.status, 80) === "CLAIMED"
          ? text(state?.owner_intervention?.claim_id, 120) || null
          : null,
    });
    return {
      intervention: claimed?.intervention || null,
      lookup_failed: false,
      blocked_by_existing_claim: claimed?.blocked_by_existing_claim === true,
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_OWNER_INTERVENTION_LOOKUP_FAILED",
      mission_id: missionId,
      reason: text(error?.message || error, 500),
      code_execution_blocked:
        text(state?.owner_intervention?.status, 80) === "CLAIMED",
      intervention_claimed: false,
      source_mutation_performed: false,
      authorization_effect: "NONE",
    }));
    return { intervention: null, lookup_failed: true, blocked_by_existing_claim: false };
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

async function safeRecordEngineeringSkillLifecycle(context, result) {
  try {
    return await recordCodeAIEngineeringSkillLifecycleOutcome({
      context: object(context),
      result,
      allowPromotionCandidate: false,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_ENGINEERING_SKILL_LIFECYCLE_RECORD_FAILED",
      mission_id: text(result?.state?.mission_id, 240) || null,
      reason: text(error?.message || error, 500),
      code_execution_blocked: false,
      code_execution_result_changed: false,
      promotion_candidate_written: false,
      authorization_effect: "NONE",
    }));
    return {
      contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
      applicable: false,
      written: 0,
      observations: [],
      promotion_evaluated: false,
      promotion_candidates_written: 0,
      reason: "SKILL_LIFECYCLE_RECORD_UNAVAILABLE",
      failure_reason: text(error?.message || error, 500) || null,
      code_execution_result_changed: false,
      authorization_effect: "NONE",
    };
  }
}

function stateWithClaimedOwnerIntervention(state, intervention) {
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
      id: intervention?.id || null,
      contract:
        text(intervention?.contract, 180) || CODE_AI_OWNER_INTERVENTION_CONTRACT,
      lifecycle_contract:
        text(intervention?.lifecycle_contract, 180) ||
        CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
      action: text(intervention?.action, 80) || "STEER",
      instruction,
      status: "CLAIMED",
      claim_id: text(intervention?.claim_id, 120) || null,
      claimed_at: text(intervention?.claimed_at, 120) || now,
      claim_expires_at: text(intervention?.claim_expires_at, 120) || null,
      fresh_reasoning_required: true,
      applied_at: null,
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
        lifecycle_contract:
          text(intervention?.lifecycle_contract, 180) ||
          CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
        action: text(intervention?.action, 80) || "STEER",
        status: "claimed_at_safe_boundary",
        claim_id: text(intervention?.claim_id, 120) || null,
        fresh_reasoning_required: true,
        authorization_effect: "NONE",
        commit_authority: false,
        production_deploy_authority: false,
        source_mutation_performed: false,
        provider_execution_submitted: false,
      },
    ].slice(-MAX_EVIDENCE_ITEMS),
  };
}

function latestFreshReasoningPackage(state, claimedAt) {
  const minimum = time(claimedAt);
  const evidence = list(state?.evidence);
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const entry = object(evidence[index]);
    if (text(entry.kind, 120) !== "batched_reasoning_package") continue;
    if (!time(entry.at) || time(entry.at) < minimum) continue;
    if (!Number.isInteger(Number(entry.reasoning_call)) || Number(entry.reasoning_call) < 1) {
      continue;
    }
    return entry;
  }
  return null;
}

function stateWithAppliedOwnerIntervention(state, intervention, reasoningPackage) {
  const source = object(state);
  const now = new Date().toISOString();
  return {
    ...source,
    owner_intervention: {
      ...object(source.owner_intervention),
      id: intervention?.id || source?.owner_intervention?.id || null,
      contract:
        text(intervention?.contract, 180) || CODE_AI_OWNER_INTERVENTION_CONTRACT,
      lifecycle_contract:
        text(intervention?.lifecycle_contract, 180) ||
        CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
      action: text(intervention?.action, 80) || text(source?.owner_intervention?.action, 80) || "STEER",
      status: "APPLIED",
      fresh_reasoning_required: false,
      applied_at: text(intervention?.applied_at, 120) || now,
      applied_reasoning_package_at:
        text(intervention?.applied_reasoning_package_at, 120) ||
        text(reasoningPackage?.at, 120) ||
        null,
      applied_reasoning_call:
        Number(intervention?.applied_reasoning_call || reasoningPackage?.reasoning_call || 0) || null,
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
        lifecycle_contract:
          text(intervention?.lifecycle_contract, 180) ||
          CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
        action: text(intervention?.action, 80) || "STEER",
        status: "applied_after_fresh_reasoning_package",
        claim_id: text(intervention?.claim_id, 120) || null,
        reasoning_package_at: text(reasoningPackage?.at, 120) || null,
        reasoning_call: Number(reasoningPackage?.reasoning_call || 0) || null,
        fresh_reasoning_required: false,
        authorization_effect: "NONE",
        commit_authority: false,
        production_deploy_authority: false,
        source_mutation_performed: false,
        provider_execution_submitted: false,
      },
    ].slice(-MAX_EVIDENCE_ITEMS),
  };
}

function stateWithReleasedOwnerIntervention(state, intervention, reason) {
  const source = object(state);
  const now = new Date().toISOString();
  return {
    ...source,
    owner_intervention: {
      ...object(source.owner_intervention),
      id: intervention?.id || source?.owner_intervention?.id || null,
      contract:
        text(intervention?.contract, 180) || CODE_AI_OWNER_INTERVENTION_CONTRACT,
      lifecycle_contract:
        text(intervention?.lifecycle_contract, 180) ||
        CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
      action: text(intervention?.action, 80) || text(source?.owner_intervention?.action, 80) || "STEER",
      status: "PENDING",
      claim_id: null,
      claimed_at: null,
      claim_expires_at: null,
      fresh_reasoning_required: false,
      applied_at: null,
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
        lifecycle_contract:
          text(intervention?.lifecycle_contract, 180) ||
          CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
        action: text(intervention?.action, 80) || "STEER",
        status: "claim_released_to_pending",
        reason: text(reason, 300) || "FRESH_REASONING_PACKAGE_NOT_PRODUCED",
        authorization_effect: "NONE",
        commit_authority: false,
        production_deploy_authority: false,
        source_mutation_performed: false,
        provider_execution_submitted: false,
      },
    ].slice(-MAX_EVIDENCE_ITEMS),
  };
}

function ownerInterventionReconciliationBlocked(state, reason) {
  const blockedReason = text(reason, 500) || "CODE_AI_OWNER_INTERVENTION_RECONCILIATION_REQUIRED";
  return {
    success: false,
    contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
    status: "blocked",
    reason: blockedReason,
    state: {
      ...object(state),
      status: "blocked",
      blockers: [blockedReason],
      updated_at: new Date().toISOString(),
    },
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

  const claim = await safeClaimOwnerIntervention(input, missionId, workingState);
  if (
    claim.lookup_failed &&
    text(workingState?.owner_intervention?.status, 80) === "CLAIMED"
  ) {
    return ownerInterventionReconciliationBlocked(
      workingState,
      "CODE_AI_OWNER_INTERVENTION_CLAIM_RECONCILIATION_REQUIRED",
    );
  }
  if (
    claim.blocked_by_existing_claim &&
    text(workingState?.owner_intervention?.status, 80) !== "CLAIMED"
  ) {
    return ownerInterventionReconciliationBlocked(
      workingState,
      "CODE_AI_OWNER_INTERVENTION_ALREADY_CLAIMED_BY_ANOTHER_CONTINUATION",
    );
  }

  const intervention = claim.intervention;
  if (intervention?.instruction) {
    workingObjective = ownerSteeringObjective(workingObjective, intervention);
    workingState = stateWithClaimedOwnerIntervention(workingState, intervention);
  }

  let strategicResult;
  try {
    strategicResult = await executeCodeAIStrategicBatchedMission({
      ...input,
      objective: workingObjective,
      resume_state: workingState,
    });
  } catch (error) {
    if (intervention?.claim_id) {
      try {
        await releaseClaimedCodeAIOwnerIntervention({
          context: object(input.context),
          missionId,
          interventionId: intervention.id,
          claimId: intervention.claim_id,
          reason: `STRATEGIC_EXECUTION_THROW:${text(error?.message || error, 200)}`,
        });
      } catch (releaseError) {
        console.error(JSON.stringify({
          event: "AVANTIQO_CODE_OWNER_INTERVENTION_RELEASE_FAILED",
          mission_id: missionId,
          reason: text(releaseError?.message || releaseError, 500),
          original_failure: text(error?.message || error, 500),
          authorization_effect: "NONE",
        }));
      }
    }
    throw error;
  }

  if (intervention?.claim_id) {
    const freshPackage = latestFreshReasoningPackage(
      strategicResult?.state,
      intervention.claimed_at,
    );
    if (freshPackage) {
      let applied;
      try {
        applied = await applyClaimedCodeAIOwnerIntervention({
          context: object(input.context),
          missionId,
          interventionId: intervention.id,
          claimId: intervention.claim_id,
          reasoningPackage: freshPackage,
        });
      } catch (error) {
        return ownerInterventionReconciliationBlocked(
          strategicResult?.state || workingState,
          `CODE_AI_OWNER_INTERVENTION_APPLY_FAILED:${text(error?.message || error, 400)}`,
        );
      }
      if (applied?.applied !== true || !applied?.intervention) {
        return ownerInterventionReconciliationBlocked(
          strategicResult?.state || workingState,
          "CODE_AI_OWNER_INTERVENTION_APPLY_RECONCILIATION_REQUIRED",
        );
      }
      strategicResult = {
        ...object(strategicResult),
        state: stateWithAppliedOwnerIntervention(
          strategicResult?.state || workingState,
          applied.intervention,
          freshPackage,
        ),
      };
    } else if (text(strategicResult?.status, 120) !== "planner_pending") {
      let released;
      try {
        released = await releaseClaimedCodeAIOwnerIntervention({
          context: object(input.context),
          missionId,
          interventionId: intervention.id,
          claimId: intervention.claim_id,
          reason:
            text(strategicResult?.reason, 300) ||
            "FRESH_REASONING_PACKAGE_NOT_PRODUCED",
        });
      } catch (error) {
        return ownerInterventionReconciliationBlocked(
          strategicResult?.state || workingState,
          `CODE_AI_OWNER_INTERVENTION_RELEASE_FAILED:${text(error?.message || error, 400)}`,
        );
      }
      if (released?.released !== true || !released?.intervention) {
        return ownerInterventionReconciliationBlocked(
          strategicResult?.state || workingState,
          "CODE_AI_OWNER_INTERVENTION_RELEASE_RECONCILIATION_REQUIRED",
        );
      }
      strategicResult = {
        ...object(strategicResult),
        state: stateWithReleasedOwnerIntervention(
          strategicResult?.state || workingState,
          released.intervention,
          strategicResult?.reason,
        ),
      };
    }
  }

  const result = {
    ...object(strategicResult),
    verified_engineering_memory:
      strategicResult?.state?.verified_engineering_memory || workingState.verified_engineering_memory || null,
    formed_engineering_skills:
      strategicResult?.state?.formed_engineering_skills || workingState.formed_engineering_skills || null,
  };
  const [utility, lifecycle] = await Promise.all([
    safeRecordEngineeringMemoryUtility(input.context, result),
    safeRecordEngineeringSkillLifecycle(input.context, result),
  ]);
  return {
    ...result,
    engineering_memory_utility: utility,
    engineering_skill_lifecycle: lifecycle,
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
  engineering_skill_lifecycle_contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
  engineering_skill_lifecycle_feedback: true,
  engineering_skill_lifecycle_failure_blocks_code: false,
  engineering_skill_direct_current_head_contradiction_required_for_decay: true,
  engineering_skill_sha_movement_alone_causes_decay: false,
  engineering_skill_dynamic_merge_split: true,
  engineering_skill_direct_platform_knowledge_write_allowed: false,
  owner_intervention_contract: CODE_AI_OWNER_INTERVENTION_CONTRACT,
  owner_intervention_lifecycle_contract: CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
  owner_intervention_safe_boundary: true,
  owner_intervention_starts_second_mission: false,
  owner_intervention_lookup_failure_blocks_claimed_resume: true,
  owner_intervention_pending_claimed_applied_lifecycle: true,
  owner_intervention_expired_claim_recovery: true,
  owner_intervention_applied_requires_fresh_reasoning_package: true,
  deterministic_convergence_execute:
    executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
  control_contract: CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  max_package_operations: CodeAIWorkPackageCoreRuntime.max_package_operations,
  allowed_package_actions: CodeAIWorkPackageCoreRuntime.allowed_package_actions,
  implementation_actions: CodeAIWorkPackageCoreRuntime.implementation_actions,
});

export default CodeAIWorkPackageRuntime;
