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
  bindAvantiqoIntelligenceCodeMissionExecution,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_BINDING_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionExecutionBindingRuntime";
import {
  handoffVerifiedCodeMissionToLearning,
  AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoCodeMissionLearningHandoffRuntime";
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

export function createCodeAIAutonomousCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_autonomous",
    action: "execute",
    description:
      "Run Avantiqo Code as an employee-style software engineer with deterministic fast start. The public capability begins useful repository inspection and known-file evidence loading before the first model call, preserves permission, attestation, server-owned verification evidence and separately governed commit boundaries, then uses bounded multi-operation work packages for coherent implementation. When a canonical Avantiqo Intelligence mission context is supplied, Code consumes its verified Learning and General architecture context inside the existing reasoning budget, reconciles repository HEAD before mutation, and returns verified structural learning evidence through the shared governed Learning lifecycle. Code verifies deterministically, repairs only when evidence changes, and continues until Product-selected completion criteria and risk-scaled world-class quality are proven or a genuine blocker remains. Default reasoning spend is capped; persistent GitHub commits remain a separate governed capability.",
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
      "verified-learning-feedback",
      "repository-head-reconciliation",
      "product-objective-provenance",
      "product-completion-criteria",
      "reasoning-spend-fuse",
      "non-authoritative-context",
      "verifiable-outcome",
      "server-owned-commit-artifact",
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
        intelligence_mission_context: {
          type: "object",
          description:
            "Optional canonical AVANTIQO_INTELLIGENCE_CODE_MISSION_V1 context produced by shared Self-Learning and General Intelligence. It is revalidated server-side, has no authorization effect, must match objective/repository/ref, and requires exact repository HEAD reconciliation before Code mutation.",
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
            "Hard maximum owned-model reasoning calls for this engineering mission. Deterministic reads, writes, tests and diffs do not consume this budget.",
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
    const missionInput = object(payload.intelligence_mission_context);
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
      resume_state: resumeStateForExecution(payload.resume_state),
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
        learned_knowledge_evaluated:
          unifiedBinding.context_consumption?.learned_knowledge_evaluated === true,
        general_system_reasoning_consumed:
          unifiedBinding.context_consumption?.general_system_reasoning_consumed === true,
        additional_reasoning_call_required: false,
        context_authorization_effect: "NONE",
      };
    }

    if (result?.state) {
      result.state = attestCodeMissionState({
        ...result.state,
        organization_id: context.organizationId,
        actor_id: actorId(context),
      });
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
    }

    return result;
  }

  return { manifest, authorize, execute };
}

export default createCodeAIAutonomousCapability;
