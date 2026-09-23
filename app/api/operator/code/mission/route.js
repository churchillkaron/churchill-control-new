import { randomUUID } from "node:crypto";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createCodeAIAutonomousCapability } from "@/lib/platform/capabilities/createCodeAIAutonomousCapability";
import { withCodeAIInteractivePreviewContext } from "@/lib/code/runtime/CodeAIInteractivePreviewContextRuntime";
import { loadCodeAIMissionResumeSnapshot } from "@/lib/code/runtime/CodeAIMissionHistoryRuntime";
import {
  resolveCodeAIDeveloperVerificationRequest,
  runCodeAIDeveloperVerification,
} from "@/lib/code/runtime/CodeAIDeveloperVerificationRuntime";
import {
  resolveCodeAIDeveloperImplementationRequest,
  runCodeAIDeveloperImplementation,
} from "@/lib/code/runtime/CodeAIDeveloperImplementationRuntime";
import {
  loadCodeAILiveProgress,
  publishCodeAILiveProgress,
} from "@/lib/code/runtime/CodeAILiveProgressRuntime";
import {
  AVANTIQO_CODE_CERTIFICATION_CONTRACT,
  AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
} from "@/lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration";

export const runtime = "nodejs";
export const maxDuration = 900;

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const SERVICE_ID = "ai.code.debug";
const PROVIDER_ID = "avantiqo-code";
const PREVIEW_MANAGER = "AVANTIQO_CODE_STUDIO_PREVIEW";
const PREVIEW_CONTRACT = "AVANTIQO_CODE_STUDIO_INTERACTIVE_PREVIEW_V1";
const DEFAULT_REPOSITORY = "https://github.com/churchillkaron/churchill-control-new";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function executionKey(value) {
  const requested = text(value, 160);
  if (requested) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$/.test(requested)) {
      throw new Error("CODE_STUDIO_EXECUTION_KEY_INVALID");
    }
    return requested;
  }
  return `code-studio:${randomUUID()}`;
}

function errorResponse(error, status = 500) {
  return Response.json({
    success: false,
    contract: PREVIEW_CONTRACT,
    certification_contract: AVANTIQO_CODE_CERTIFICATION_CONTRACT,
    certified_runtime_contract: AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
    error: text(error?.message || error, 1000) || "CODE_STUDIO_MISSION_FAILED",
    production_routing_activated: false,
    production_deploy_performed: false,
    commit_performed: false,
    external_fallback_allowed: false,
    raw_reasoning_returned: false,
  }, { status: error?.status || status });
}

async function currentOrganizationService(organizationId) {
  const result = await supabaseAdmin
    .from("organization_services")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("service_id", SERVICE_ID)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function enablePreviewService(organizationId) {
  const existing = await currentOrganizationService(organizationId);
  if (existing && existing.managed_by !== PREVIEW_MANAGER) {
    if (
      String(existing.status || "").toUpperCase() !== "ACTIVE" ||
      existing.usage_enabled !== true ||
      existing.billing_enabled !== true
    ) {
      const error = new Error("CODE_STUDIO_EXISTING_SERVICE_CONFIGURATION_REQUIRES_ADMIN_REVIEW");
      error.status = 409;
      throw error;
    }
    return { created: false, preview_managed: false, restore: null, service: existing };
  }

  const restore = existing
    ? {
        usage_enabled: existing.usage_enabled === true,
        billing_enabled: existing.billing_enabled === true,
      }
    : null;

  const result = await supabaseAdmin
    .from("organization_services")
    .upsert({
      organization_id: organizationId,
      service_category_id: "platform-ai",
      service_id: SERVICE_ID,
      status: "ACTIVE",
      managed_by: PREVIEW_MANAGER,
      authorization_required: false,
      usage_enabled: true,
      billing_enabled: true,
      default_provider_id: PROVIDER_ID,
      fallback_enabled: false,
      billing_mode: "wallet",
      pricing_mode: "provider",
      default_currency: "THB",
      metadata: {
        interactive_preview_only: true,
        preview_contract: PREVIEW_CONTRACT,
        certification_contract: AVANTIQO_CODE_CERTIFICATION_CONTRACT,
        certified_runtime_contract: AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
        owned_only_required: true,
        external_fallback_allowed: false,
        production_routing_allowed: false,
        commit_authority: false,
        deploy_authority: false,
      },
      configuration: {
        code_studio_preview: true,
        provider: PROVIDER_ID,
      },
    }, { onConflict: "organization_id,service_id" })
    .select("*")
    .single();
  if (result.error) throw result.error;
  return {
    created: !existing,
    preview_managed: true,
    restore,
    service: result.data,
  };
}

async function restorePreviewService(organizationId, gate) {
  if (!gate?.preview_managed) return;
  const restore = gate.restore || { usage_enabled: false, billing_enabled: false };
  const result = await supabaseAdmin
    .from("organization_services")
    .update({
      usage_enabled: restore.usage_enabled === true,
      billing_enabled: restore.billing_enabled === true,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("service_id", SERVICE_ID)
    .eq("managed_by", PREVIEW_MANAGER)
    .select("id,usage_enabled,billing_enabled")
    .maybeSingle();
  if (result.error) throw result.error;
}

export async function POST(request) {
  let organizationId = null;
  let gate = null;
  try {
    const body = await request.json().catch(() => ({}));
    organizationId = text(body.organizationId || body.organization_id, 200);
    const requestedObjective = text(body.objective, 4000);
    const requestedRepositoryUrl = text(body.repository_url || body.repositoryUrl || DEFAULT_REPOSITORY, 1000);
    const requestedRef = text(body.ref || "main", 160) || "main";
    const requestedWorkspaceTarget = text(body.workspace_target || body.workspaceTarget || "SANDBOX", 80).toUpperCase();
    const requestedDeviceId = text(body.device_id || body.deviceId, 160) || null;
    const requestedDeviceSessionId = text(body.device_session_id || body.deviceSessionId, 160) || null;
    const requestedExecutionKey = text(body.execution_key || body.executionKey, 160);
    const requestedMissionId = text(body.mission_id || body.missionId, 240);
    const resumeMissionId = text(body.resume_mission_id || body.resumeMissionId, 240);
    let effectiveResumeMissionId = resumeMissionId;
    const suppliedResumeState = Object.keys(object(body.resume_state || body.resumeState)).length
      ? object(body.resume_state || body.resumeState)
      : null;
    const suppliedIntelligencePreparation = Object.keys(object(body.intelligence_mission_preparation || body.intelligenceMissionPreparation)).length
      ? object(body.intelligence_mission_preparation || body.intelligenceMissionPreparation)
      : null;
    const suppliedIntelligenceContext = Object.keys(object(body.intelligence_mission_context || body.intelligenceMissionContext)).length
      ? object(body.intelligence_mission_context || body.intelligenceMissionContext)
      : null;
    const suppliedObjectiveContext = Object.keys(object(body.objective_context || body.objectiveContext)).length
      ? object(body.objective_context || body.objectiveContext)
      : null;
    const reasoningCallBudget = boundedInteger(body.reasoning_call_budget, 4, 1, 8);
    const maxEmployeePasses = boundedInteger(body.max_employee_passes, 8, 1, 16);

    if (!organizationId) return errorResponse(new Error("organization_id required"), 400);
    if (requestedMissionId && !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,239}$/.test(requestedMissionId)) {
      return errorResponse(new Error("CODE_STUDIO_MISSION_ID_INVALID"), 400);
    }
    if (!["SANDBOX", "LOCAL_COMPUTER", "DEVICE"].includes(requestedWorkspaceTarget)) {
      return errorResponse(new Error("CODE_STUDIO_WORKSPACE_TARGET_INVALID"), 400);
    }
    if (requestedWorkspaceTarget === "DEVICE" && !requestedDeviceId) {
      return errorResponse(new Error("CODE_STUDIO_DEVICE_ID_REQUIRED"), 400);
    }
    if (!requestedObjective && !resumeMissionId) {
      return errorResponse(new Error("objective or resume_mission_id required"), 400);
    }
    if (resumeMissionId && (suppliedIntelligencePreparation || suppliedIntelligenceContext || suppliedObjectiveContext)) {
      return errorResponse(new Error("CODE_STUDIO_HISTORY_RESUME_CONTEXT_MUST_BE_SERVER_OWNED"), 400);
    }
    if (suppliedIntelligencePreparation && suppliedIntelligenceContext) {
      return errorResponse(new Error("CODE_STUDIO_INTELLIGENCE_CONTEXT_AMBIGUOUS"), 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) {
      return errorResponse(Object.assign(new Error(access.error), { status: access.status || 403 }), access.status || 403);
    }

    const actorId = text(access.user?.id || access.userId, 200);
    if (!actorId) return errorResponse(new Error("CODE_STUDIO_ACTOR_REQUIRED"), 403);

    const context = {
      organizationId,
      organization_id: organizationId,
      partyId: access.staff?.party_id || access.staff?.partyId || null,
      permissions: access.permissions || [],
      actor: { id: actorId },
      metadata: {
        partyId: access.staff?.party_id || access.staff?.partyId || null,
        code_studio_preview: true,
        code_certification_contract: AVANTIQO_CODE_CERTIFICATION_CONTRACT,
        code_runtime_contract: AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
      },
    };

    let objective = requestedObjective;
    let repositoryUrl = requestedRepositoryUrl;
    let ref = requestedRef;
    let key = executionKey(requestedExecutionKey);
    let resumeState = suppliedResumeState;
    let resumedFromHistory = false;

    if (resumeMissionId) {
      if (suppliedResumeState) {
        return errorResponse(new Error("CODE_STUDIO_HISTORY_RESUME_STATE_MUST_BE_SERVER_OWNED"), 400);
      }
      let snapshot = null;
      let snapshotInvalid = false;
      try {
        snapshot = await loadCodeAIMissionResumeSnapshot({
          context,
          missionId: resumeMissionId,
        });
      } catch (snapshotError) {
        const snapshotReason = text(snapshotError?.message || snapshotError, 1000);
        if (/CODE_AI_MISSION_ATTESTATION_INVALID|CODE_AI_MISSION_ATTESTATION_REQUIRED/i.test(snapshotReason)) {
          snapshotInvalid = true;
        } else {
          throw snapshotError;
        }
      }
      if (snapshotInvalid || !snapshot?.found) {
        if (!requestedObjective || !requestedRepositoryUrl) {
          return errorResponse(new Error(snapshotInvalid ? "CODE_STUDIO_HISTORY_CHECKPOINT_INVALID" : "CODE_STUDIO_HISTORY_MISSION_NOT_FOUND"), snapshotInvalid ? 409 : 404);
        }
        effectiveResumeMissionId = "";
        objective = requestedObjective;
        repositoryUrl = requestedRepositoryUrl;
        ref = requestedRef;
        key = executionKey(requestedExecutionKey);
        resumeState = null;
        resumedFromHistory = false;
      } else {
        objective = snapshot.objective;
        repositoryUrl = snapshot.repository_url;
        ref = snapshot.ref || "main";
        key = executionKey(snapshot.execution_key);
        resumeState = snapshot.resume_state;
        resumedFromHistory = true;
      }
    }

    if (!objective) return errorResponse(new Error("objective required"), 400);
    if (!repositoryUrl) return errorResponse(new Error("repository_url required"), 400);

    const resumeStateMissionId = text(resumeState?.mission_id, 240);
    if (requestedMissionId && resumeStateMissionId && requestedMissionId !== resumeStateMissionId) {
      return errorResponse(new Error("CODE_STUDIO_MISSION_ID_RESUME_MISMATCH"), 409);
    }
    const missionId = resumeStateMissionId || effectiveResumeMissionId || requestedMissionId || `code-mission-${randomUUID()}`;
    const resumedControl = object(resumeState?.work_package_control);
    const resumedBudget = Number(resumedControl.reasoning_call_budget || 0);
    const resumedCallsUsed = Number(resumedControl.reasoning_calls_used || 0);
    const ownerContinuationBudgetExtension = Boolean(
      resumedFromHistory &&
      text(resumeState?.status, 120).toLowerCase() === "blocked" &&
      Number.isFinite(resumedBudget) &&
      resumedBudget > 0 &&
      Number.isFinite(resumedCallsUsed) &&
      resumedCallsUsed >= resumedBudget &&
      reasoningCallBudget > resumedBudget
    );

    const developerVerification = resolveCodeAIDeveloperVerificationRequest(objective);
    if (
      developerVerification.eligible === true &&
      requestedWorkspaceTarget === "DEVICE" &&
      requestedDeviceId &&
      requestedDeviceSessionId &&
      !effectiveResumeMissionId &&
      !suppliedResumeState
    ) {
      const result = await runCodeAIDeveloperVerification({
        context,
        objective,
        repository_url: repositoryUrl,
        ref,
        organization_id: organizationId,
        device_id: requestedDeviceId,
        device_session_id: requestedDeviceSessionId,
        mission_id: missionId,
        timeout_ms: 180000,
      });
      return Response.json({
        success: result.success === true,
        contract: PREVIEW_CONTRACT,
        certification_contract: AVANTIQO_CODE_CERTIFICATION_CONTRACT,
        certified_runtime_contract: AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
        status: result.status,
        reason: result.reason || null,
        execution_key: key,
        mission_id: result.state?.mission_id || null,
        resume_required: false,
        resume_state: result.state || null,
        state: result.state || null,
        developer_verification: result,
        workspace_target: requestedWorkspaceTarget,
        device_id: requestedDeviceId,
        device_session_id: requestedDeviceSessionId,
        shared_device_session_preserved: true,
        preview_service_temporarily_enabled: false,
        production_routing_activated: false,
        pricing_activated: false,
        commit_performed: false,
        production_deploy_performed: false,
        external_fallback_allowed: false,
        raw_reasoning_returned: false,
      });
    }

    const developerImplementation = resolveCodeAIDeveloperImplementationRequest(objective);
    if (
      developerImplementation.eligible === true &&
      requestedWorkspaceTarget === "DEVICE" &&
      requestedDeviceId &&
      requestedDeviceSessionId
    ) {
      const result = await runCodeAIDeveloperImplementation({
        context,
        objective,
        repository_url: repositoryUrl,
        ref,
        organization_id: organizationId,
        device_id: requestedDeviceId,
        device_session_id: requestedDeviceSessionId,
        mission_id: missionId,
        reasoning_call_budget: Math.min(Math.max(reasoningCallBudget, 12), 12),
        timeout_ms: 360000,
        resume_state: suppliedResumeState || resumeState || null,
      });
      return Response.json({
        success: result?.success === true,
        contract: PREVIEW_CONTRACT,
        certification_contract: AVANTIQO_CODE_CERTIFICATION_CONTRACT,
        certified_runtime_contract: AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
        status: text(result?.status || result?.state?.status, 120) || "unknown",
        reason: text(result?.reason, 1000) || null,
        execution_key: key,
        mission_id: text(result?.state?.mission_id, 240) || null,
        resume_required: ["planner_pending", "repair_required", "verification_required"].includes(
          text(result?.status || result?.state?.status, 120),
        ),
        resume_state: result?.state || null,
        state: result?.state || null,
        developer_implementation: result?.developer_implementation || null,
        workspace_target: requestedWorkspaceTarget,
        device_id: requestedDeviceId,
        device_session_id: requestedDeviceSessionId,
        shared_device_session_preserved: true,
        preview_service_temporarily_enabled: false,
        production_routing_activated: false,
        pricing_activated: false,
        commit_performed: false,
        production_deploy_performed: false,
        external_fallback_allowed: false,
        raw_reasoning_returned: false,
      });
    }

    const existingProgress = requestedDeviceSessionId
      ? await loadCodeAILiveProgress({
          context,
          device_session_id: requestedDeviceSessionId,
        }).catch(() => ({ found: false, live_progress: null }))
      : { found: false, live_progress: null };
    const missionAlreadyAccepted = Boolean(
      existingProgress?.found === true &&
      text(existingProgress?.live_progress?.mission_id, 240) === missionId
    );
    if (!missionAlreadyAccepted) {
      await publishCodeAILiveProgress({
        context,
        state: {
          mission_id: missionId,
          objective,
          repository_url: repositoryUrl,
          ref,
          status: "running",
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
          objective_context: {
            organization_id: organizationId,
            workspace_target: requestedWorkspaceTarget,
            device_id: requestedDeviceId,
            device_session_id: requestedDeviceSessionId,
            mission_id: missionId,
          },
          completed_operation_ids: [],
          files_changed: [],
        },
        event: {
          phase: "MISSION_ACCEPTED",
          status: "running",
          mission_id: missionId,
          description: "Code accepted the mission and is preparing repository evidence and planning.",
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
        },
      });
    }

    if (!missionAlreadyAccepted) {
      await publishCodeAILiveProgress({
        context,
        state: {
          mission_id: missionId,
          objective,
          repository_url: repositoryUrl,
          ref,
          status: "running",
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
          objective_context: {
            organization_id: organizationId,
            workspace_target: requestedWorkspaceTarget,
            device_id: requestedDeviceId,
            device_session_id: requestedDeviceSessionId,
            mission_id: missionId,
          },
        },
        event: {
          phase: "CODE_SERVICE_GATE_CHECK",
          status: "running",
          mission_id: missionId,
          description: "I’m checking the local Code service gate before I start the repository pass.",
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
        },
      }).catch(() => null);
    }
    const capability = createCodeAIAutonomousCapability();
    capability.authorize({ context });
    gate = await enablePreviewService(organizationId);
    if (!missionAlreadyAccepted) {
      await publishCodeAILiveProgress({
        context,
        state: {
          mission_id: missionId,
          objective,
          repository_url: repositoryUrl,
          ref,
          status: "running",
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
          objective_context: {
            organization_id: organizationId,
            workspace_target: requestedWorkspaceTarget,
            device_id: requestedDeviceId,
            device_session_id: requestedDeviceSessionId,
            mission_id: missionId,
          },
        },
        event: {
          phase: "CODE_SERVICE_GATE_READY",
          status: "running",
          mission_id: missionId,
          description: "The local Code service gate is ready. I’m starting the repository capability now.",
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
        },
      }).catch(() => null);
    }

    const result = await withCodeAIInteractivePreviewContext({
      organization_id: organizationId,
      actor_id: actorId,
      execution_key: key,
    }, () => capability.execute({
      context,
      payload: {
        objective,
        owner_intent: objective,
        repository_url: repositoryUrl,
        ref,
        workspace_target: requestedWorkspaceTarget,
        device_id: requestedDeviceId,
        device_session_id: requestedDeviceSessionId,
        execution_key: key,
        resume_state: resumeState,
        resume_existing_mission: missionAlreadyAccepted,
        intelligence_mission_preparation: suppliedIntelligencePreparation,
        intelligence_mission_context: suppliedIntelligenceContext,
        objective_context: {
          ...object(suppliedObjectiveContext),
          ...(ownerContinuationBudgetExtension
            ? {
                adaptive_reasoning_budget_applied: true,
                owner_continuation_budget_extension: true,
                prior_reasoning_call_budget: resumedBudget,
                continued_reasoning_call_budget: reasoningCallBudget,
              }
            : {}),
          mission_id: missionId,
        },
        reasoning_call_budget: reasoningCallBudget,
        max_employee_passes: maxEmployeePasses,
        timeout_ms: 840000,
      },
    }));

    const finalStatus = text(result?.status || result?.state?.status, 120) || "unknown";
    if (
      ["running", "planner_pending", "repair_required", "verification_required", "review_required", "replan_required"].includes(finalStatus.toLowerCase()) &&
      !result?.state
    ) {
      throw new Error("CODE_STUDIO_RUNNING_STATE_REQUIRED");
    }

    const normalizedFinalStatus = finalStatus.toLowerCase();
    if (["blocked", "failed", "stopped", "cancelled", "completed"].includes(normalizedFinalStatus)) {
      const finalReason = text(
        result?.reason ||
        result?.state?.blockers?.[0] ||
        result?.state?.failures?.[0]?.reason ||
        result?.state?.failures?.[0]?.message,
        1000,
      ) || null;
      await publishCodeAILiveProgress({
        context,
        state: {
          ...object(result?.state),
          mission_id: missionId,
          objective,
          repository_url: repositoryUrl,
          ref,
          status: normalizedFinalStatus,
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
        },
        event: {
          phase: normalizedFinalStatus === "completed" ? "MISSION_COMPLETED" : "MISSION_TERMINAL",
          status: normalizedFinalStatus,
          mission_id: missionId,
          reason: finalReason,
          description: normalizedFinalStatus === "completed"
            ? "Code completed the mission and finished verification."
            : finalReason || `Code stopped with status ${normalizedFinalStatus}.`,
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
        },
      }).catch(() => null);
    }

    return Response.json({
      success: result?.success === true,
      contract: PREVIEW_CONTRACT,
      certification_contract: AVANTIQO_CODE_CERTIFICATION_CONTRACT,
      certified_runtime_contract: AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
      status: finalStatus,
      reason: text(result?.reason, 1000) || null,
      execution_key: key,
      mission_id: text(result?.state?.mission_id, 240) || resumeMissionId || null,
      resumed_from_history: resumedFromHistory,
      resumed_mission_id: resumedFromHistory ? effectiveResumeMissionId : null,
      resume_required: text(result?.status, 120) === "planner_pending" || result?.interactive_yield === true,
      interactive_yield: result?.interactive_yield === true,
      resume_state: result?.state || null,
      state: result?.state || null,
      engineering_operating_system: result?.engineering_operating_system || result?.state?.engineering_operating_system || null,
      engineering_precision_os: result?.engineering_precision_os || result?.state?.engineering_precision_os || null,
      customer_artifact: result?.customer_artifact || null,
      employee_completion: result?.employee_completion || null,
      engineering_plan: result?.engineering_plan || result?.state?.engineering_plan || null,
      verified_engineering_memory: result?.verified_engineering_memory || null,
      engineering_memory_utility: result?.engineering_memory_utility || null,
      formed_engineering_skills: result?.formed_engineering_skills || null,
      engineering_skill_lifecycle: result?.engineering_skill_lifecycle || null,
      fast_start: result?.fast_start || null,
      execution_transport: result?.execution_transport || null,
      workspace_target: requestedWorkspaceTarget,
      device_id: requestedDeviceId,
      device_session_id: requestedDeviceSessionId,
      intelligence_context_supplied: Boolean(suppliedIntelligencePreparation || suppliedIntelligenceContext),
      objective_context_supplied: Boolean(suppliedObjectiveContext),
      preview_service_temporarily_enabled: true,
      production_routing_activated: false,
      pricing_activated: false,
      commit_performed: false,
      production_deploy_performed: false,
      external_fallback_allowed: false,
      raw_reasoning_returned: false,
    });
  } catch (error) {
    console.error("CODE_STUDIO_MISSION_ERROR", {
      error: text(error?.message || error, 700),
      organization_id: organizationId,
      production_deploy_performed: false,
      commit_performed: false,
    });
    return errorResponse(error, error?.status || 500);
  } finally {
    if (organizationId && gate) {
      await restorePreviewService(organizationId, gate).catch((error) => {
        console.error("CODE_STUDIO_PREVIEW_SERVICE_RESTORE_FAILED", {
          error: text(error?.message || error, 700),
          organization_id: organizationId,
        });
      });
    }
  }
}
