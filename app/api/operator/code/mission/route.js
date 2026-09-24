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
import {
  MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET,
  MAX_CODE_AI_REASONING_CALL_BUDGET,
} from "@/lib/code/runtime/CodeAIPlannerSpendPolicy";
import {
  codeStudioLocalMissionBackgroundStatus,
  startCodeStudioLocalMissionBackground,
} from "@/lib/code/runtime/CodeStudioLocalMissionBackgroundRuntime";

export const runtime = "nodejs";
export const maxDuration = 900;

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const SERVICE_ID = "ai.code.debug";
const PROVIDER_ID = "avantiqo-code";
const PREVIEW_MANAGER = "AVANTIQO_CODE_STUDIO_PREVIEW";
const PREVIEW_CONTRACT = "AVANTIQO_CODE_STUDIO_INTERACTIVE_PREVIEW_V1";
const DEFAULT_REPOSITORY = "https://github.com/churchillkaron/churchill-control-new";
const CODE_STUDIO_GATE_DB_TIMEOUT_MS = 5000;

function gateDbSignal() {
  return AbortSignal.timeout(CODE_STUDIO_GATE_DB_TIMEOUT_MS);
}

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
    .maybeSingle()
    .abortSignal(gateDbSignal());
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
    .single()
    .abortSignal(gateDbSignal());
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
    .maybeSingle()
    .abortSignal(gateDbSignal());
  if (result.error) throw result.error;
}

function codeMissionCompletedOperationCount(state = {}) {
  return Array.isArray(state?.completed_operation_ids)
    ? state.completed_operation_ids.length
    : Number(state?.completed_operation_count || 0);
}

function codeMissionTerminalReason(result = {}, state = {}) {
  return text(
    result?.reason ||
    state?.blockers?.[0] ||
    state?.failures?.at?.(-1)?.reason ||
    state?.failures?.at?.(-1)?.message,
    1000,
  ) || null;
}

async function publishCodeMissionTerminal({
  context,
  missionId,
  objective,
  repositoryUrl,
  ref,
  requestedDeviceId,
  requestedDeviceSessionId,
  state,
  status,
  reason,
}) {
  const normalizedStatus = text(status, 120).toLowerCase() || "failed";
  await publishCodeAILiveProgress({
    context,
    state: {
      ...object(state),
      mission_id: missionId,
      objective,
      repository_url: repositoryUrl,
      ref,
      status: normalizedStatus,
      device_id: requestedDeviceId,
      device_session_id: requestedDeviceSessionId,
    },
    event: {
      phase: normalizedStatus === "completed"
        ? "LOCAL_BACKGROUND_MISSION_COMPLETED"
        : "LOCAL_BACKGROUND_MISSION_TERMINAL",
      status: normalizedStatus,
      mission_id: missionId,
      reason: reason || null,
      description: normalizedStatus === "completed"
        ? "Code completed the mission and finished verification."
        : reason || `Code stopped with status ${normalizedStatus}.`,
      device_id: requestedDeviceId,
      device_session_id: requestedDeviceSessionId,
    },
  }).catch(() => null);
}

async function runLocalDeviceMissionBackground({
  context,
  organizationId,
  actorId,
  objective,
  repositoryUrl,
  ref,
  executionKey: key,
  missionId,
  resumeState,
  reasoningCallBudget,
  reasoningBudgetCeiling,
  maxEmployeePasses,
  requestedDeviceId,
  requestedDeviceSessionId,
  suppliedIntelligencePreparation,
  suppliedIntelligenceContext,
  suppliedObjectiveContext,
}) {
  let gate = null;
  let currentState = resumeState || null;
  let currentBudget = reasoningCallBudget;
  let lastContinuationCompletedCount = -1;
  let lastResumeFingerprint = "";
  let stagnantResumePasses = 0;
  let stagnationReplanUsed = false;
  let controlPlaneRecoveryAttempts = 0;
  const maxControlPlaneRecoveryAttempts = 6;
  const capability = createCodeAIAutonomousCapability();

  try {
    capability.authorize({ context });
    await publishCodeAILiveProgress({
      context,
      state: {
        ...object(currentState),
        mission_id: missionId,
        objective,
        repository_url: repositoryUrl,
        ref,
        status: "running",
        device_id: requestedDeviceId,
        device_session_id: requestedDeviceSessionId,
        objective_context: {
          ...object(currentState?.objective_context),
          organization_id: organizationId,
          workspace_target: "DEVICE",
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
          mission_id: missionId,
        },
      },
      event: {
        phase: currentState ? "MISSION_RESUME_ACCEPTED" : "MISSION_ACCEPTED",
        status: "running",
        mission_id: missionId,
        description: currentState
          ? "Code resumed the preserved local mission in the background worker."
          : "Code started the local mission in the background worker.",
        device_id: requestedDeviceId,
        device_session_id: requestedDeviceSessionId,
      },
    }).catch(() => null);
    gate = await enablePreviewService(organizationId);

    for (let pass = 1; pass <= 120; pass += 1) {
      const previousBudget = Number(currentState?.work_package_control?.reasoning_call_budget || 0);
      const adaptiveBudget = currentBudget > previousBudget;
      let heartbeatTimer = null;
      let passSettled = false;
      try {
        heartbeatTimer = setInterval(() => {
          void (async () => {
            if (passSettled) return;
            const latest = await loadCodeAILiveProgress({
              context,
              device_session_id: requestedDeviceSessionId,
            }).catch(() => null);
            const latestProgress = latest?.live_progress || null;
            const latestEvent = latestProgress?.latest_event || null;
            const latestAt = Date.parse(text(latestEvent?.at || latestProgress?.updated_at));
            const freshRealProgress = Number.isFinite(latestAt) && (Date.now() - latestAt) < 12000;
            if (freshRealProgress) return;

            const latestPhase = text(latestEvent?.phase || latestEvent?.action || latestEvent?.status, 120);
            const latestDescription = text(
              latestEvent?.description || latestEvent?.reason,
              1200,
            );
            const latestFilePath = text(latestEvent?.file_path || latestEvent?.path, 1000);
            const genericLatest = /LOCAL_BACKGROUND_PASS|MISSION_ACCEPTED|MISSION_RESUME_ACCEPTED/i.test(latestPhase);
            if (passSettled) return;

            await publishCodeAILiveProgress({
              context,
              state: {
                ...object(currentState),
                mission_id: missionId,
                objective,
                repository_url: repositoryUrl,
                ref,
                status: "running",
                device_id: requestedDeviceId,
                device_session_id: requestedDeviceSessionId,
              },
              event: {
                phase: "LOCAL_BACKGROUND_PASS",
                status: "running",
                mission_id: missionId,
                description: !genericLatest && latestDescription
                  ? latestDescription
                  : latestFilePath
                    ? `I’m still working in ${latestFilePath}. This bounded pass is waiting for the next repository boundary before I continue.`
                    : heartbeatCount === 1
                      ? "The local Code employee has started, but it has not produced its first repository operation yet. I’m watching the workspace handoff now rather than starting a second worker."
                      : heartbeatCount === 2
                        ? "No repository operation has arrived within the first 30 seconds. I’m waiting for this bounded pass to return so I can recover from the preserved mission state instead of leaving it silent."
                        : "This pass has exceeded the normal time to produce concrete repository evidence. I’m treating the workspace/control-plane handoff as unhealthy and will recover from the same preserved mission state at the next safe boundary.",
                file_path: !genericLatest ? (latestFilePath || null) : null,
                device_id: requestedDeviceId,
                device_session_id: requestedDeviceSessionId,
              },
            }).catch(() => null);
          })();
        }, 15000);
        heartbeatTimer.unref?.();

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
            workspace_target: "DEVICE",
            device_id: requestedDeviceId,
            device_session_id: requestedDeviceSessionId,
            execution_key: key,
            resume_state: currentState,
            resume_existing_mission: Boolean(currentState),
            intelligence_mission_preparation: suppliedIntelligencePreparation,
            intelligence_mission_context: suppliedIntelligenceContext,
            objective_context: {
              ...object(suppliedObjectiveContext),
              ...(adaptiveBudget
                ? {
                    adaptive_reasoning_budget_applied: true,
                    bounded_continuation_budget_extension: true,
                    prior_reasoning_call_budget: previousBudget || null,
                    continued_reasoning_call_budget: currentBudget,
                  }
                : {}),
              mission_id: missionId,
              organization_id: organizationId,
              workspace_target: "DEVICE",
              device_id: requestedDeviceId,
              device_session_id: requestedDeviceSessionId,
            },
            reasoning_call_budget: currentBudget,
            max_employee_passes: maxEmployeePasses,
            timeout_ms: 30000,
          },
        }));

        passSettled = true;
        const nextState = result?.state || currentState || {};
        const status = text(result?.status || nextState?.status, 120).toLowerCase() || "unknown";
        const resultReason = codeMissionTerminalReason(result, nextState);
        const controlPlaneUnavailable =
          status === "blocked" &&
          /CODE_AI_CONTROL_PLANE_(?:CHECK_TIMEOUT|TEMPORARILY_UNAVAILABLE)/i.test(resultReason || "");

        if (controlPlaneUnavailable && controlPlaneRecoveryAttempts < maxControlPlaneRecoveryAttempts) {
          controlPlaneRecoveryAttempts += 1;
          currentState = {
            ...object(nextState),
            status: "running",
            blockers: [],
          };
          await publishCodeAILiveProgress({
            context,
            state: {
              ...object(currentState),
              mission_id: missionId,
              objective,
              repository_url: repositoryUrl,
              ref,
              status: "running",
              device_id: requestedDeviceId,
              device_session_id: requestedDeviceSessionId,
            },
            event: {
              phase: "LOCAL_BACKGROUND_CONTROL_PLANE_RECOVERY",
              status: "running",
              mission_id: missionId,
              description: `Mission control is temporarily unavailable. I preserved the repository state and I’m retrying this same safe boundary before any new mutation (${controlPlaneRecoveryAttempts}/${maxControlPlaneRecoveryAttempts}).`,
              device_id: requestedDeviceId,
              device_session_id: requestedDeviceSessionId,
            },
          }).catch(() => null);
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(8000, 750 * (2 ** Math.max(0, controlPlaneRecoveryAttempts - 1))))
          );
          continue;
        }
        if (!controlPlaneUnavailable) controlPlaneRecoveryAttempts = 0;

        const resumable = Boolean(
          result?.interactive_yield === true ||
          nextState?.planner_pending ||
          ["running", "planner_pending", "repair_required", "verification_required", "review_required", "replan_required"].includes(status)
        );

        if (resumable) {
          currentState = nextState;
          const completedCount = codeMissionCompletedOperationCount(nextState);
          const resumeFingerprint = JSON.stringify({
            completed_operation_count: completedCount,
            current_operation_id: text(nextState?.current_operation_id, 240),
            source_change_count: Number(nextState?.source_change_count || 0),
            files_changed: Array.isArray(nextState?.files_changed) ? nextState.files_changed.slice().sort() : [],
            verification_count: Array.isArray(nextState?.tests) ? nextState.tests.length : 0,
            blocker: text(nextState?.blockers?.[0], 700),
          });
          if (resumeFingerprint === lastResumeFingerprint) {
            stagnantResumePasses += 1;
          } else {
            lastResumeFingerprint = resumeFingerprint;
            stagnantResumePasses = 0;
          }
          if (stagnantResumePasses >= 3) {
            if (!stagnationReplanUsed) {
              stagnationReplanUsed = true;
              stagnantResumePasses = 0;
              lastResumeFingerprint = "";
              currentState = {
                ...object(nextState),
                status: "replan_required",
                planner_pending: null,
                objective_context: {
                  ...object(nextState?.objective_context),
                  background_no_progress_replan: true,
                  background_no_progress_completed_operation_count: completedCount,
                },
                blockers: ["CODE_STUDIO_BACKGROUND_NO_PROGRESS_REPLAN_REQUIRED"],
              };
              await publishCodeAILiveProgress({
                context,
                state: {
                  ...object(currentState),
                  mission_id: missionId,
                  objective,
                  repository_url: repositoryUrl,
                  ref,
                  status: "running",
                  device_id: requestedDeviceId,
                  device_session_id: requestedDeviceSessionId,
                },
                event: {
                  phase: "LOCAL_BACKGROUND_NO_PROGRESS_REPLAN",
                  status: "running",
                  mission_id: missionId,
                  description: `Code has not produced a new repository operation across three continuation passes. I’m discarding the stale planner continuation and replanning once from the preserved repository evidence.`,
                  device_id: requestedDeviceId,
                  device_session_id: requestedDeviceSessionId,
                },
              }).catch(() => null);
              continue;
            }
            const stagnantReason = text(nextState?.blockers?.[0], 1000) || "CODE_STUDIO_BACKGROUND_NO_PROGRESS_AFTER_REPLAN";
            await publishCodeMissionTerminal({
              context,
              missionId,
              objective,
              repositoryUrl,
              ref,
              requestedDeviceId,
              requestedDeviceSessionId,
              state: nextState,
              status: "blocked",
              reason: stagnantReason,
            });
            return { status: "blocked", state: nextState, reason: stagnantReason };
          }
          await publishCodeAILiveProgress({
            context,
            state: {
              ...object(nextState),
              mission_id: missionId,
              objective,
              repository_url: repositoryUrl,
              ref,
              status: "running",
              device_id: requestedDeviceId,
              device_session_id: requestedDeviceSessionId,
            },
            event: {
              phase: "LOCAL_BACKGROUND_CONTINUING",
              status: "running",
              mission_id: missionId,
              description: completedCount
                ? `This bounded Code pass finished with ${completedCount} repository operation${completedCount === 1 ? "" : "s"} completed. I’m continuing the same preserved mission into the next concrete step.`
                : "This bounded Code pass finished. I’m continuing the same preserved mission into the next concrete step.",
              device_id: requestedDeviceId,
              device_session_id: requestedDeviceSessionId,
            },
          }).catch(() => null);
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }

        const reason = resultReason;
        const budgetExhausted = /CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED/i.test(reason || "");
        const completedCount = codeMissionCompletedOperationCount(nextState);
        const usedCalls = Number(nextState?.work_package_control?.reasoning_calls_used || 0);

        if (
          status === "blocked" &&
          budgetExhausted &&
          completedCount > lastContinuationCompletedCount &&
          currentBudget < reasoningBudgetCeiling
        ) {
          lastContinuationCompletedCount = completedCount;
          const budgetBeyondUsed = usedCalls > 0 ? Math.ceil((usedCalls + 1) / 4) * 4 : 0;
          const nextBudget = Math.min(
            reasoningBudgetCeiling,
            Math.max(currentBudget + 4, budgetBeyondUsed),
          );
          if (nextBudget > currentBudget) {
            currentBudget = nextBudget;
            currentState = nextState;
            await publishCodeAILiveProgress({
              context,
              state: {
                ...object(nextState),
                mission_id: missionId,
                status: "running",
                device_id: requestedDeviceId,
                device_session_id: requestedDeviceSessionId,
              },
              event: {
                phase: "REASONING_TRANCHE_CONTINUATION",
                status: "running",
                mission_id: missionId,
                description: `Code completed ${completedCount} repository operation${completedCount === 1 ? "" : "s"} and is continuing the same local mission with the ${currentBudget}-call bounded tranche.`,
                device_id: requestedDeviceId,
                device_session_id: requestedDeviceSessionId,
              },
            }).catch(() => null);
            continue;
          }
        }

        await publishCodeMissionTerminal({
          context,
          missionId,
          objective,
          repositoryUrl,
          ref,
          requestedDeviceId,
          requestedDeviceSessionId,
          state: nextState,
          status,
          reason,
        });
        return { status, state: nextState, reason };
      } finally {
        passSettled = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
    }

    const reason = "CODE_STUDIO_BACKGROUND_RESUME_LIMIT_EXCEEDED";
    await publishCodeMissionTerminal({
      context,
      missionId,
      objective,
      repositoryUrl,
      ref,
      requestedDeviceId,
      requestedDeviceSessionId,
      state: currentState,
      status: "blocked",
      reason,
    });
    return { status: "blocked", state: currentState, reason };
  } catch (error) {
    const reason = text(error?.message || error, 1000) || "CODE_STUDIO_BACKGROUND_FAILED";
    await publishCodeMissionTerminal({
      context,
      missionId,
      objective,
      repositoryUrl,
      ref,
      requestedDeviceId,
      requestedDeviceSessionId,
      state: currentState,
      status: "failed",
      reason,
    });
    throw error;
  } finally {
    if (gate) {
      await restorePreviewService(organizationId, gate).catch((error) => {
        console.error("CODE_STUDIO_BACKGROUND_PREVIEW_SERVICE_RESTORE_FAILED", {
          error: text(error?.message || error, 700),
          organization_id: organizationId,
          mission_id: missionId,
        });
      });
    }
  }
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
    const reasoningBudgetCeiling = requestedWorkspaceTarget === "DEVICE"
      ? MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET
      : MAX_CODE_AI_REASONING_CALL_BUDGET;
    let reasoningCallBudget = boundedInteger(body.reasoning_call_budget, 4, 1, reasoningBudgetCeiling);
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
    const resumedTerminalReason = text(
      resumeState?.blockers?.[0] ||
      resumeState?.failures?.at?.(-1)?.reason ||
      resumeState?.failures?.at?.(-1)?.message,
      1000,
    );
    const resumedBudgetExhausted = /CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED/i.test(resumedTerminalReason);
    if (
      requestedWorkspaceTarget === "DEVICE" &&
      resumeState &&
      resumedBudgetExhausted &&
      Number.isFinite(resumedCallsUsed) &&
      resumedCallsUsed > 0
    ) {
      const nextBudgetBeyondUsedCalls = Math.ceil((resumedCallsUsed + 1) / 4) * 4;
      reasoningCallBudget = Math.min(
        reasoningBudgetCeiling,
        Math.max(
          reasoningCallBudget,
          Number.isFinite(resumedBudget) ? resumedBudget + 4 : 0,
          nextBudgetBeyondUsedCalls,
        ),
      );
    }
    const boundedContinuationBudgetExtension = Boolean(
      resumeState &&
      text(resumeState?.status, 120).toLowerCase() === "blocked" &&
      Number.isFinite(resumedBudget) &&
      resumedBudget > 0 &&
      Number.isFinite(resumedCallsUsed) &&
      resumedCallsUsed >= resumedBudget &&
      reasoningCallBudget > resumedBudget &&
      reasoningCallBudget <= reasoningBudgetCeiling
    );

    if (
      requestedWorkspaceTarget === "DEVICE" &&
      requestedDeviceId &&
      requestedDeviceSessionId
    ) {
      const existingBackground = codeStudioLocalMissionBackgroundStatus({
        organization_id: organizationId,
        mission_id: missionId,
      });
      if (existingBackground.running === true) {
        return Response.json({
          success: true,
          contract: PREVIEW_CONTRACT,
          certification_contract: AVANTIQO_CODE_CERTIFICATION_CONTRACT,
          certified_runtime_contract: AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
          status: "accepted",
          async_running: true,
          already_running: true,
          mission_id: missionId,
          execution_key: key,
          workspace_target: requestedWorkspaceTarget,
          device_id: requestedDeviceId,
          device_session_id: requestedDeviceSessionId,
          resume_required: false,
          production_routing_activated: false,
          pricing_activated: false,
          commit_performed: false,
          production_deploy_performed: false,
          external_fallback_allowed: false,
          raw_reasoning_returned: false,
        });
      }

      const background = startCodeStudioLocalMissionBackground({
        organization_id: organizationId,
        mission_id: missionId,
        run: () => runLocalDeviceMissionBackground({
          context,
          organizationId,
          actorId,
          objective,
          repositoryUrl,
          ref,
          executionKey: key,
          missionId,
          resumeState,
          reasoningCallBudget,
          reasoningBudgetCeiling,
          maxEmployeePasses,
          requestedDeviceId,
          requestedDeviceSessionId,
          suppliedIntelligencePreparation,
          suppliedIntelligenceContext,
          suppliedObjectiveContext: {
            ...object(suppliedObjectiveContext),
            ...(boundedContinuationBudgetExtension
              ? {
                  adaptive_reasoning_budget_applied: true,
                  bounded_continuation_budget_extension: true,
                  prior_reasoning_call_budget: resumedBudget,
                  continued_reasoning_call_budget: reasoningCallBudget,
                }
              : {}),
          },
        }),
      });

      return Response.json({
        success: true,
        contract: PREVIEW_CONTRACT,
        certification_contract: AVANTIQO_CODE_CERTIFICATION_CONTRACT,
        certified_runtime_contract: AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
        status: "accepted",
        async_running: true,
        already_running: background.already_running === true,
        mission_id: missionId,
        execution_key: key,
        workspace_target: requestedWorkspaceTarget,
        device_id: requestedDeviceId,
        device_session_id: requestedDeviceSessionId,
        resume_required: false,
        production_routing_activated: false,
        pricing_activated: false,
        commit_performed: false,
        production_deploy_performed: false,
        external_fallback_allowed: false,
        raw_reasoning_returned: false,
      });
    }

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
          ...(boundedContinuationBudgetExtension
            ? {
                adaptive_reasoning_budget_applied: true,
                bounded_continuation_budget_extension: true,
                prior_reasoning_call_budget: resumedBudget,
                continued_reasoning_call_budget: reasoningCallBudget,
              }
            : {}),
          mission_id: missionId,
        },
        reasoning_call_budget: reasoningCallBudget,
        max_employee_passes: maxEmployeePasses,
        timeout_ms: 30000,
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
