import {
  executeCodeAIEmployeeFastStartMission,
  CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
} from "@/lib/code/runtime/CodeAIEmployeeFastStartRuntime";
import {
  executeCodeAIEmployeeZeroIdleFastStartMission,
  CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_CONTRACT,
} from "@/lib/code/runtime/CodeAIEmployeeZeroIdleFastStartRuntime";
import {
  CODE_AI_EMPLOYEE_RUNTIME_CONTRACT,
  CODE_AI_EMPLOYEE_MISSION_CONTRACT,
} from "@/lib/code/runtime/CodeAIEmployeeRuntime";
import {
  attestCodeMissionState,
  verifyCodeMissionStateAttestation,
} from "@/lib/code/runtime/CodeMissionAttestationRuntime";
import {
  persistCodeAIAutonomousExecutionState,
} from "@/lib/code/runtime/CodeAIAutonomousExecutionStateRuntime";
import {
  persistCodeAICommitArtifact,
} from "@/lib/code/runtime/CodeAICommitArtifactRuntime";
import {
  recordCodeAIEngineeringSkillLifecycleOutcome,
  CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
} from "@/lib/code/runtime/CodeAIEngineeringSkillLifecycleRuntime";
import {
  bindAvantiqoIntelligenceCodeMissionExecution,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_BINDING_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionExecutionBindingRuntime";
import {
  prepareAvantiqoIntelligenceCodeMission,
  createAvantiqoIntelligenceCodeMissionResumeCapsule,
  bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState,
  inspectAvantiqoIntelligenceCodeMissionResumeCapsule,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTRACT,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionPreparationRuntime";
import {
  handoffVerifiedCodeMissionToLearning,
  AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoCodeMissionLearningHandoffRuntime";
import {
  recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility,
  AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoCodeMissionVerifiedFailureUtilityRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";
const RESTORABLE_MISSION_STATUSES = new Set([
  "completed",
  "repair_required",
  "verification_required",
  "review_required",
  "replan_required",
  "blocked",
  "running",
]);

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function zeroIdleServerlessEnabled() {
  return enabled(process.env.AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_ENABLED);
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id) || null;
}

function assertResumeScope(resumeState, context) {
  const resume = object(resumeState);
  if (!Object.keys(resume).length) return;
  verifyCodeMissionStateAttestation(resume);
  const organizationId = text(context?.organizationId);
  if (!organizationId || text(resume.organization_id) !== organizationId) {
    throw new Error("CODE_AI_AUTONOMOUS_RESUME_ORGANIZATION_MISMATCH");
  }
  if (text(resume.actor_id) !== actorId(context)) {
    throw new Error("CODE_AI_AUTONOMOUS_RESUME_ACTOR_MISMATCH");
  }
}

function resumeStateForExecution(resumeState) {
  const resume = object(resumeState);
  if (text(resume.status) !== "planner_pending") return resumeState || null;

  const evidence = [...list(resume.evidence)].reverse();
  const restoredStatus = evidence
    .map((entry) => text(entry?.status))
    .find((status) => RESTORABLE_MISSION_STATUSES.has(status));
  if (!restoredStatus) {
    throw new Error("CODE_AI_AUTONOMOUS_PENDING_RESUME_STATUS_EVIDENCE_REQUIRED");
  }

  return {
    ...resume,
    status: restoredStatus,
    blockers: restoredStatus === "blocked" ? list(resume.blockers) : [],
  };
}

function employeePassBudget(payload = {}) {
  const explicit = Number(payload.max_employee_passes);
  if (Number.isInteger(explicit) && explicit > 0) return Math.min(16, explicit);
  const legacy = Number(payload.max_iterations);
  if (Number.isInteger(legacy) && legacy > 0) return Math.min(16, legacy);
  return 8;
}

function verifiedEmployeeCompletion(result) {
  return Boolean(
    result?.success === true &&
    text(result?.status, 100) === "completed" &&
    result?.employee_completion?.complete === true &&
    result?.employee_completion?.verified === true &&
    result?.employee_completion?.final_diff_observed === true
  );
}

function learningHandoffSummary(value = {}) {
  const source = object(value);
  return {
    contract: text(source.contract, 180) || AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT,
    status: text(source.status, 180) || null,
    persisted: source.persisted === true,
    evidence_candidate_written: source.evidence_candidate_written === true,
    reusable_platform_knowledge_written: false,
    next_stage_contract: text(source.next_stage_contract, 180) || null,
    automatic_knowledge_promotion: false,
    trusted_knowledge_written: false,
  };
}

function verifiedFailureUtilitySummary(value = {}) {
  const source = object(value);
  return {
    contract: text(source.contract, 180) ||
      AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
    status: text(source.status, 180) || null,
    applicable: source.applicable === true,
    written: source.written === true,
    outcome: text(source.outcome, 120) || null,
    failure_reason: text(source.failure_reason, 500) || null,
    observational_association_only: true,
    causal_attribution_allowed: false,
    automatic_knowledge_promotion: false,
    automatic_training_effect: "NONE",
  };
}

function preparationRequest(payload = {}) {
  const source = object(payload.intelligence_mission_preparation);
  if (!Object.keys(source).length) return null;
  const missionId = text(source.mission_id, 240);
  const complexityClass = text(source.complexity_class, 40).toLowerCase();
  if (!missionId) {
    throw new Error("CODE_AI_AUTONOMOUS_INTELLIGENCE_MISSION_ID_REQUIRED");
  }
  if (!complexityClass) {
    throw new Error("CODE_AI_AUTONOMOUS_INTELLIGENCE_COMPLEXITY_REQUIRED");
  }
  return {
    mission: {
      id: missionId,
      objective: text(payload.objective, 8000),
      business_intent: text(source.business_intent || payload.owner_intent, 6000) || null,
    },
    complexity_class: complexityClass,
    canonical_context: object(source.canonical_context),
    repository_url: text(payload.repository_url, 1000),
    ref: text(payload.ref, 240) || "main",
    knowledge_options: object(source.knowledge_options),
  };
}

async function resolveUnifiedMission({ context, payload, resumeState }) {
  const suppliedContext = object(payload.intelligence_mission_context);
  const request = preparationRequest(payload);
  const resumeInspection = Object.keys(object(resumeState)).length
    ? inspectAvantiqoIntelligenceCodeMissionResumeCapsule({ resume_state: resumeState })
    : {
        present: false,
        reusable: false,
        reprepare_required: false,
        mission_context: null,
        reprepare_request: null,
      };

  if (resumeInspection.reusable === true) {
    return {
      mission_context: resumeInspection.mission_context,
      preparation: null,
      capsule: resumeInspection.capsule,
      route: "ATTESTED_RESUME_CAPSULE_REUSED",
      preparation_repeated: false,
    };
  }

  if (resumeInspection.reprepare_required === true) {
    const reprepare = object(resumeInspection.reprepare_request);
    const prepared = await prepareAvantiqoIntelligenceCodeMission({
      context,
      mission: reprepare.mission,
      complexity_class: reprepare.complexity_class,
      canonical_context: reprepare.canonical_context,
      repository_url: reprepare.repository_url,
      ref: reprepare.ref,
      timeout_ms: payload.timeout_ms || null,
      knowledge_options: reprepare.knowledge_options,
    });
    return {
      mission_context: prepared.mission_context,
      preparation: prepared,
      capsule: createAvantiqoIntelligenceCodeMissionResumeCapsule({
        preparation: prepared,
        preparation_request: reprepare,
        source: "REPREPARED_AFTER_REPOSITORY_MOVE",
      }),
      route: "REPREPARED_AFTER_REPOSITORY_MOVE",
      preparation_repeated: true,
    };
  }

  if (Object.keys(suppliedContext).length) {
    return {
      mission_context: suppliedContext,
      preparation: null,
      capsule: createAvantiqoIntelligenceCodeMissionResumeCapsule({
        mission_context: suppliedContext,
        preparation_request: request || null,
        source: "SUPPLIED_CANONICAL_CONTEXT",
      }),
      route: "SUPPLIED_CANONICAL_CONTEXT",
      preparation_repeated: false,
    };
  }

  if (request) {
    const prepared = await prepareAvantiqoIntelligenceCodeMission({
      context,
      mission: request.mission,
      complexity_class: request.complexity_class,
      canonical_context: request.canonical_context,
      repository_url: request.repository_url,
      ref: request.ref,
      timeout_ms: payload.timeout_ms || null,
      knowledge_options: request.knowledge_options,
    });
    return {
      mission_context: prepared.mission_context,
      preparation: prepared,
      capsule: createAvantiqoIntelligenceCodeMissionResumeCapsule({
        preparation: prepared,
        preparation_request: request,
        source: "PREPARED_BY_SHARED_INTELLIGENCE",
      }),
      route: "PREPARED_BY_SHARED_INTELLIGENCE",
      preparation_repeated: false,
    };
  }

  return {
    mission_context: null,
    preparation: null,
    capsule: null,
    route: "LEGACY_CODE_NO_UNIFIED_MISSION",
    preparation_repeated: false,
  };
}

export function createCodeAIAutonomousCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_autonomous",
    action: "execute",
    description:
      "Run Avantiqo Code as an employee-style software engineer with deterministic fast start. The public capability begins useful repository inspection and known-file evidence loading before the first model call, preserves permission, attestation, server-owned verification evidence and separately governed commit boundaries, then uses bounded multi-operation work packages for coherent implementation. Unified missions can be prepared by shared Self-Learning and General Intelligence at this boundary, are carried across worker-warming/planner-pending resumes by an attested capsule without repeating Intelligence work, and are re-prepared only after the repository actually moves. Code consumes the canonical context inside the existing reasoning budget, reconciles repository HEAD before mutation, and returns verified structural learning evidence through the shared governed Learning lifecycle. Default reasoning spend is capped; persistent GitHub commits remain a separate governed capability.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "code-ai",
      "autonomous",
      "employee-runtime",
      "deterministic-fast-start",
      "zero-idle-serverless-capable",
      "batched-work-packages",
      "software-engineering",
      "repair-loop",
      "verification",
      "fresh-verification",
      "final-diff-review",
      "risk-sensitive-quality",
      "world-class-quality-gate",
      "owned-orchestration",
      "unified-intelligence-mission",
      "resumable-intelligence-preparation",
      "verified-learning-feedback",
      "repository-head-reconciliation",
      "product-objective-provenance",
      "product-completion-criteria",
      "reasoning-spend-fuse",
      "non-authoritative-context",
      "verifiable-outcome",
      "server-owned-commit-artifact",
      "governed-engineering-skill-lifecycle",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["objective", "repository_url"],
      properties: {
        objective: { type: "string", minLength: 1, maxLength: 4000 },
        owner_intent: {
          type: "string",
          maxLength: 4000,
          description:
            "Optional higher-level owner/customer intent retained by the employee mission while Code executes the current engineering objective. If omitted, objective is used.",
        },
        intelligence_mission_preparation: {
          type: "object",
          description:
            "Optional shared Intelligence preparation request. Requires a stable mission_id and an explicit simple|medium|large complexity class. Simple skips Learning/General; medium evaluates reusable verified Learning; large evaluates Learning and invokes the existing General system-reasoning runtime. Prepared context is carried in the attested Code resume state and is not recomputed for ordinary worker/planner resumes.",
          required: ["mission_id", "complexity_class"],
          properties: {
            mission_id: { type: "string", minLength: 1, maxLength: 240 },
            complexity_class: { type: "string", enum: ["simple", "medium", "large"] },
            business_intent: { type: "string", maxLength: 4000 },
            canonical_context: { type: "object" },
            knowledge_options: { type: "object" },
          },
          additionalProperties: false,
        },
        intelligence_mission_context: {
          type: "object",
          description:
            "Optional prebuilt canonical AVANTIQO_INTELLIGENCE_CODE_MISSION_V1 context. It is revalidated server-side, has no authorization effect, must match objective/repository/ref, and is wrapped in the same attested resume capsule used by prepared missions.",
        },
        objective_context: {
          type: "object",
          description:
            "Optional bounded Product Intelligence provenance and completion targets for the selected objective. This is engineering context only and never permission, approval, commit, deployment or migration authority.",
          properties: {
            repository_head_observed: { type: "string", maxLength: 160 },
            selection_contract: { type: "string", maxLength: 160 },
            selected_candidate_id: { type: "string", maxLength: 120 },
            selection_score: { type: "number" },
            evidence_backed: { type: "boolean" },
            evidence_path_1: { type: "string", maxLength: 1000 },
            evidence_path_2: { type: "string", maxLength: 1000 },
            evidence_path_3: { type: "string", maxLength: 1000 },
            evidence_path_4: { type: "string", maxLength: 1000 },
            completion_criterion_1: { type: "string", maxLength: 700 },
            completion_criterion_2: { type: "string", maxLength: 700 },
            completion_criterion_3: { type: "string", maxLength: 700 },
            completion_criterion_4: { type: "string", maxLength: 700 },
            completion_criterion_5: { type: "string", maxLength: 700 },
            completion_criterion_6: { type: "string", maxLength: 700 },
          },
          additionalProperties: false,
        },
        repository_url: { type: "string", minLength: 1, maxLength: 500 },
        ref: { type: "string", maxLength: 160, default: "main" },
        execution_key: {
          type: "string",
          minLength: 12,
          maxLength: 160,
          pattern: EXECUTION_KEY_PATTERN,
          description:
            "Opaque caller-chosen correlation key. It has no authorization effect. Reuse the exact same key in platform.code_ai_autonomous_status.verify and, after explicit commit governance is satisfied, platform.code_ai_commit.execute.",
        },
        resume_state: { type: "object" },
        reasoning_call_budget: {
          type: "integer",
          minimum: 1,
          maximum: 8,
          default: 4,
          description:
            "Hard maximum owned-model Code reasoning calls for this engineering mission. Deterministic reads, writes, tests and diffs do not consume this budget. Large mission preparation may separately perform the single existing General architecture reasoning pass before Code starts.",
        },
        max_employee_passes: {
          type: "integer",
          minimum: 1,
          maximum: 16,
          default: 8,
          description:
            "Maximum bounded controller passes. A pass may resume pending inference or close deterministic quality gaps without implying a new model call.",
        },
        warm_session_idle_ms: {
          type: "integer",
          minimum: 60000,
          maximum: 1800000,
          default: 600000,
          description:
            "Requested bounded warm-session idle window for the legacy/direct warm-worker lane. Ignored by explicit zero-idle Serverless mode.",
        },
        max_iterations: {
          type: "integer",
          minimum: 1,
          maximum: 24,
          default: 16,
          description:
            "Legacy compatibility input. When max_employee_passes is omitted it is capped and reused only as the employee controller pass budget, not as a paid reasoning-call budget.",
        },
        timeout_ms: { type: "integer", minimum: 30000, maximum: 1200000 },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    assertResumeScope(payload.resume_state, context);
    const resumeState = resumeStateForExecution(payload.resume_state);
    const unified = await resolveUnifiedMission({
      context,
      payload,
      resumeState,
    });
    const missionInput = object(unified.mission_context);
    const unifiedBinding = Object.keys(missionInput).length
      ? bindAvantiqoIntelligenceCodeMissionExecution({
          mission_context: missionInput,
          objective: payload.objective,
          repository_url: payload.repository_url,
          ref: payload.ref || "main",
          objective_context: object(payload.objective_context),
        })
      : null;
    const executionObjective = unifiedBinding?.code_objective || payload.objective;
    const executionObjectiveContext = unifiedBinding?.objective_context || object(payload.objective_context);

    const zeroIdle = zeroIdleServerlessEnabled();
    const executeFastStart = zeroIdle
      ? executeCodeAIEmployeeZeroIdleFastStartMission
      : executeCodeAIEmployeeFastStartMission;
    const result = await executeFastStart({
      context,
      objective: executionObjective,
      owner_intent: payload.owner_intent || payload.objective,
      objective_context: executionObjectiveContext,
      repository_url: payload.repository_url,
      ref: payload.ref || "main",
      resume_state: resumeState,
      reasoning_call_budget: payload.reasoning_call_budget || null,
      max_employee_passes: employeePassBudget(payload),
      timeout_ms: payload.timeout_ms || null,
      ...(zeroIdle ? {} : { warm_session_idle_ms: payload.warm_session_idle_ms || null }),
    });

    result.fast_start_contract = zeroIdle
      ? CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_CONTRACT
      : CODE_AI_EMPLOYEE_FAST_START_CONTRACT;
    result.execution_transport_mode = zeroIdle
      ? "SERVERLESS_ZERO_IDLE"
      : "DURABLE_WARM_SESSION";
    result.employee_runtime_contract = CODE_AI_EMPLOYEE_RUNTIME_CONTRACT;
    result.employee_mission_contract = CODE_AI_EMPLOYEE_MISSION_CONTRACT;

    if (unifiedBinding) {
      result.intelligence_mission_execution = {
        contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_BINDING_CONTRACT,
        mission_id: unifiedBinding.mission_context?.mission?.id || null,
        expected_repository_head: unifiedBinding.repository?.expected_head || null,
        pre_mutation_reconciliation_required: true,
        preparation_contract: unified.preparation?.contract ||
          AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTRACT,
        preparation_route: unified.route,
        preparation_repeated: unified.preparation_repeated === true,
        learned_knowledge_evaluated:
          unifiedBinding.context_consumption?.learned_knowledge_evaluated === true,
        general_system_reasoning_consumed:
          unifiedBinding.context_consumption?.general_system_reasoning_consumed === true,
        additional_code_reasoning_call_required: false,
        context_authorization_effect: "NONE",
      };
    }

    if (result?.state) {
      let stateForAttestation = result.state;
      if (unified.capsule) {
        stateForAttestation = bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState({
          state: stateForAttestation,
          capsule: unified.capsule,
        });
      }
      result.state = attestCodeMissionState({
        ...stateForAttestation,
        organization_id: context.organizationId,
        actor_id: actorId(context),
      });
      if (unified.capsule) {
        const capsule = object(result.state.intelligence_mission_resume_capsule);
        result.intelligence_mission_resume = {
          contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT,
          status: text(capsule.status, 120) || null,
          prepared_repository_head: text(capsule.prepared_repository_head, 160) || null,
          state_base_commit: text(result.state.base_commit, 160) || null,
          reusable_without_repreparation: capsule.reprepare_required !== true,
          reprepare_required: capsule.reprepare_required === true,
          repeated_learning_or_general_for_ordinary_resume: false,
          authorization_effect: "NONE",
        };
      }
    }

    if (payload.execution_key && result?.state) {
      const [persisted, commitArtifact] = await Promise.all([
        persistCodeAIAutonomousExecutionState({
          context,
          executionKey: payload.execution_key,
          result,
        }),
        persistCodeAICommitArtifact({
          context,
          executionKey: payload.execution_key,
          missionState: result.state,
        }),
      ]);
      result.verification_evidence = {
        contract: persisted.execution_state?.contract || null,
        execution_key: payload.execution_key,
        persisted: persisted.persisted === true,
        updated_at: persisted.updated_at || null,
        commit_artifact_persisted: commitArtifact.persisted === true,
        commit_artifact_updated_at: commitArtifact.updated_at || null,
      };
    }

    if (unifiedBinding && verifiedEmployeeCompletion(result)) {
      try {
        const handoff = await handoffVerifiedCodeMissionToLearning({
          mission_context: unifiedBinding.mission_context,
          code_result: result,
        });
        result.intelligence_learning_handoff = learningHandoffSummary(handoff);
      } catch (error) {
        result.intelligence_learning_handoff = {
          contract: AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT,
          status: "LEARNING_HANDOFF_FAILED",
          persisted: false,
          evidence_candidate_written: false,
          reusable_platform_knowledge_written: false,
          next_stage_contract: null,
          automatic_knowledge_promotion: false,
          trusted_knowledge_written: false,
          failure_reason: text(error?.message || error, 500),
          code_execution_remains_verified: true,
        };
      }
    } else if (unifiedBinding) {
      result.intelligence_learning_handoff = {
        contract: AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT,
        status: "NOT_ELIGIBLE_CODE_RESULT_NOT_VERIFIED_COMPLETE",
        persisted: false,
        evidence_candidate_written: false,
        reusable_platform_knowledge_written: false,
        next_stage_contract: null,
        automatic_knowledge_promotion: false,
        trusted_knowledge_written: false,
      };
      try {
        const failureUtility = await recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility({
          mission_context: unifiedBinding.mission_context,
          code_result: result,
        });
        result.intelligence_verified_failure_utility = verifiedFailureUtilitySummary(failureUtility);
      } catch (error) {
        result.intelligence_verified_failure_utility = {
          contract: AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
          status: "VERIFIED_FAILURE_UTILITY_PUBLIC_HOOK_FAILED",
          applicable: false,
          written: false,
          outcome: null,
          failure_reason: text(error?.message || error, 500),
          observational_association_only: true,
          causal_attribution_allowed: false,
          automatic_knowledge_promotion: false,
          automatic_training_effect: "NONE",
          code_execution_result_unchanged: true,
        };
      }
    }

    if (result?.state?.formed_engineering_skills?.contract) {
      try {
        result.engineering_skill_lifecycle = await recordCodeAIEngineeringSkillLifecycleOutcome({
          context,
          result,
          allowPromotionCandidate: verifiedEmployeeCompletion(result),
        });
      } catch (error) {
        result.engineering_skill_lifecycle = {
          contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
          applicable: false,
          written: 0,
          observations: [],
          promotion_evaluated: verifiedEmployeeCompletion(result),
          promotion_candidates_written: 0,
          promotion_receipts: [],
          reason: "FINAL_SKILL_LIFECYCLE_RECORD_FAILED",
          failure_reason: text(error?.message || error, 500) || null,
          code_execution_result_changed: false,
          verified_code_result_remains_valid: verifiedEmployeeCompletion(result),
          direct_platform_knowledge_write_allowed: false,
          reusable_platform_knowledge_written: false,
          automatic_knowledge_promotion: false,
          authorization_effect: "NONE",
        };
      }
    }

    return result;
  }

  return { manifest, authorize, execute };
}

export default createCodeAIAutonomousCapability;
