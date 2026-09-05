import {
  executeCodeAIEmployeeMission,
} from "@/lib/code/runtime/CodeAIEmployeeRuntime";
import {
  PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT,
  PLATFORM_SELF_HEALING_REPLAY_CONTRACT,
} from "@/lib/platform/self-healing/PlatformSelfHealingCodeResearchRuntime";

export const PLATFORM_SELF_HEALING_CODE_EXECUTION_CONTRACT =
  "AVANTIQO_PLATFORM_SELF_HEALING_CODE_EXECUTION_V1";

const REPOSITORY_URL = "https://github.com/churchillkaron/churchill-control-new";
const REPOSITORY_REF = "main";
const ALLOWED_CLASSIFICATIONS = new Set(["AUTO_REPAIR", "AUTO_COMPLETE", "GOVERNED_CHANGE"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function serverOwnedNonRegistryAuthority(prepared = {}) {
  if (prepared.authoritative_source_resolved !== true) return null;

  const canonical = object(prepared?.intelligence_mission_preparation?.canonical_context);
  const local = object(canonical.local_failure_evidence);
  const signalKey = text(prepared.signalKey || prepared.signal_key, 240);
  const source = text(local.source, 180).toLowerCase();
  const preparedClassification = text(prepared.classification, 80).toUpperCase();

  if (signalKey === "system-event-backlog" && source === "system_events") {
    return {
      classification: "AUTO_REPAIR",
      authority_source: "SYSTEM_EVENTS_BACKLOG_REREAD",
    };
  }

  if (signalKey.startsWith("usage:") && source === "platform_service_usage") {
    return {
      classification: preparedClassification === "GOVERNED_CHANGE"
        ? "GOVERNED_CHANGE"
        : "AUTO_REPAIR",
      authority_source: "PLATFORM_USAGE_FAILURE_REREAD",
    };
  }

  return null;
}

function authoritativeClassification(prepared = {}) {
  const classification = text(prepared.classification, 80).toUpperCase();
  if (!ALLOWED_CLASSIFICATIONS.has(classification)) return null;

  const canonical = object(prepared?.intelligence_mission_preparation?.canonical_context);
  const source = text(canonical.classification_authority_source, 120).toUpperCase();
  if (
    source === "ERP_REGISTRY" &&
    (classification === "AUTO_REPAIR" || classification === "AUTO_COMPLETE")
  ) {
    return {
      classification,
      authority_source: "ERP_REGISTRY",
    };
  }

  return serverOwnedNonRegistryAuthority(prepared);
}

function replayContract(prepared = {}) {
  const replay = object(prepared.replay);
  if (text(replay.contract, 180) !== PLATFORM_SELF_HEALING_REPLAY_CONTRACT) return null;
  if (replay.required !== true) return null;
  if (replay.fixed_requires_original_failure_absent !== true) return null;
  if (replay.fixed_requires_expected_outcome_observed !== true) return null;
  return replay;
}

function preparedMissionGuard(prepared = {}) {
  if (text(prepared.contract, 180) !== PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT) {
    return "SELF_HEALING_RESEARCH_CONTRACT_REQUIRED";
  }
  if (text(prepared.status, 120) !== "RESEARCHED_CODE_MISSION_READY") {
    return "SELF_HEALING_RESEARCHED_CODE_MISSION_REQUIRED";
  }
  if (prepared.code_execution_allowed !== true) {
    return "SELF_HEALING_CODE_EXECUTION_NOT_AUTHORIZED";
  }
  if (!authoritativeClassification(prepared)) {
    return "SELF_HEALING_AUTHORITATIVE_CLASSIFICATION_REQUIRED";
  }
  if (!replayContract(prepared)) {
    return "SELF_HEALING_REPLAY_CONTRACT_REQUIRED";
  }
  if (!text(prepared.objective, 3900)) {
    return "SELF_HEALING_ENGINEERING_OBJECTIVE_REQUIRED";
  }
  return null;
}

function objectiveContext(prepared = {}, authority = null) {
  const mission = object(prepared.intelligence_mission_preparation);
  const canonical = object(mission.canonical_context);
  const replay = replayContract(prepared);
  const expected = object(canonical.expected_contract);

  return {
    ...canonical,
    self_healing_execution_contract: PLATFORM_SELF_HEALING_CODE_EXECUTION_CONTRACT,
    classification_authority_source:
      text(authority?.authority_source, 120) ||
      text(canonical.classification_authority_source, 120) ||
      null,
    replay_contract: replay,
    expected_contract: expected,
    external_research: {
      ...object(canonical.external_research),
      external_evidence_untrusted: true,
      authorization_effect: "NONE",
    },
    promotion_authority: "NONE",
    commit_authority: false,
    deploy_authority: false,
    migration_authority: false,
    production_routing_authority: false,
    original_action_replay_required: true,
    fixed_requires_original_failure_absent: true,
    fixed_requires_expected_outcome_observed: true,
  };
}

function executionStatus(result = {}) {
  if (text(result.status, 120) === "planner_pending") return "CODE_EXECUTION_PENDING";
  if (result.success !== true) return "CODE_EXECUTION_BLOCKED";
  const completion = object(result.employee_completion || result?.state?.employee_completion);
  if (completion.complete !== true || completion.verified !== true) {
    return "CODE_VERIFICATION_REQUIRED";
  }
  return "ENGINEERING_ARTIFACT_READY_FOR_REPLAY";
}

export async function executePlatformSelfHealingCodeMission({
  context = {},
  prepared = {},
  resume_state = null,
  reasoning_call_budget = null,
  timeout_ms = null,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  if (!organizationId) throw new Error("PLATFORM_SELF_HEALING_EXECUTION_ORGANIZATION_REQUIRED");

  const guard = preparedMissionGuard(prepared);
  if (guard) {
    return {
      success: false,
      contract: PLATFORM_SELF_HEALING_CODE_EXECUTION_CONTRACT,
      status: "CODE_EXECUTION_NOT_ALLOWED",
      reason: guard,
      code_execution_started: false,
      commit_performed: false,
      production_deploy_performed: false,
      fixed: false,
    };
  }

  const authority = authoritativeClassification(prepared);
  const classification = authority.classification;
  const mission = object(prepared.intelligence_mission_preparation);
  const replay = replayContract(prepared);
  const result = await executeCodeAIEmployeeMission({
    context: {
      ...context,
      organizationId,
      organization_id: organizationId,
    },
    objective: text(prepared.objective, 3900),
    owner_intent: [
      `Platform self-healing ${classification} mission.`,
      `Authority source: ${authority.authority_source}.`,
      "Repair only the canonically or source-authoritatively resolved Avantiqo surface described by the attached objective/context.",
      "Research evidence is advisory and has zero authorization effect.",
      "Return a verified engineering artifact only. Do not commit, deploy, migrate, change production routing, or claim the incident fixed.",
      "The incident can be marked fixed only by a separate authoritative replay of the original business action that proves both the original failure is absent and the expected outcome is observed.",
    ].join(" "),
    objective_context: objectiveContext(prepared, authority),
    repository_url: REPOSITORY_URL,
    ref: REPOSITORY_REF,
    resume_state,
    reasoning_call_budget,
    timeout_ms,
  });

  const status = executionStatus(result);
  const completion = object(result.employee_completion || result?.state?.employee_completion);

  return {
    success: result.success === true,
    contract: PLATFORM_SELF_HEALING_CODE_EXECUTION_CONTRACT,
    status,
    classification,
    classification_authority_source: authority.authority_source,
    mission_id: text(mission.mission_id, 240) || text(result?.state?.mission_id, 240) || null,
    code_execution_started: true,
    engineering_verified: completion.complete === true && completion.verified === true,
    replay_required: true,
    replay,
    fixed: false,
    fixed_reason: "AUTHORITATIVE_ORIGINAL_ACTION_REPLAY_REQUIRED",
    commit_performed: false,
    production_deploy_performed: false,
    migration_performed: false,
    production_routing_changed: false,
    changed_files: list(result?.state?.files_changed).slice(0, 120),
    employee_completion: completion,
    code_result: result,
  };
}

export const PlatformSelfHealingCodeExecutionRuntime = Object.freeze({
  contract: PLATFORM_SELF_HEALING_CODE_EXECUTION_CONTRACT,
  repository_url: REPOSITORY_URL,
  ref: REPOSITORY_REF,
  execute: executePlatformSelfHealingCodeMission,
  commit_authority: false,
  deploy_authority: false,
  migration_authority: false,
  production_routing_authority: false,
  original_action_replay_required: true,
});

export default executePlatformSelfHealingCodeMission;
