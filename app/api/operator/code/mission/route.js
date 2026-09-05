import { randomUUID } from "node:crypto";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createCodeAIAutonomousCapability } from "@/lib/platform/capabilities/createCodeAIAutonomousCapability";
import { withCodeAIInteractivePreviewContext } from "@/lib/code/runtime/CodeAIInteractivePreviewContextRuntime";
import { loadCodeAIMissionResumeSnapshot } from "@/lib/code/runtime/CodeAIMissionHistoryRuntime";
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
    const requestedExecutionKey = text(body.execution_key || body.executionKey, 160);
    const resumeMissionId = text(body.resume_mission_id || body.resumeMissionId, 240);
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
      const snapshot = await loadCodeAIMissionResumeSnapshot({
        context,
        missionId: resumeMissionId,
      });
      if (!snapshot.found) {
        return errorResponse(new Error("CODE_STUDIO_HISTORY_MISSION_NOT_FOUND"), 404);
      }
      objective = snapshot.objective;
      repositoryUrl = snapshot.repository_url;
      ref = snapshot.ref || "main";
      key = executionKey(snapshot.execution_key);
      resumeState = snapshot.resume_state;
      resumedFromHistory = true;
    }

    if (!objective) return errorResponse(new Error("objective required"), 400);
    if (!repositoryUrl) return errorResponse(new Error("repository_url required"), 400);

    const capability = createCodeAIAutonomousCapability();
    capability.authorize({ context });
    gate = await enablePreviewService(organizationId);

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
        execution_key: key,
        resume_state: resumeState,
        intelligence_mission_preparation: suppliedIntelligencePreparation,
        intelligence_mission_context: suppliedIntelligenceContext,
        objective_context: suppliedObjectiveContext,
        reasoning_call_budget: reasoningCallBudget,
        max_employee_passes: maxEmployeePasses,
        timeout_ms: 840000,
      },
    }));

    return Response.json({
      success: result?.success === true,
      contract: PREVIEW_CONTRACT,
      certification_contract: AVANTIQO_CODE_CERTIFICATION_CONTRACT,
      certified_runtime_contract: AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT,
      status: text(result?.status || result?.state?.status, 120) || "unknown",
      reason: text(result?.reason, 1000) || null,
      execution_key: key,
      mission_id: text(result?.state?.mission_id, 240) || resumeMissionId || null,
      resumed_from_history: resumedFromHistory,
      resumed_mission_id: resumedFromHistory ? resumeMissionId : null,
      resume_required: text(result?.status, 120) === "planner_pending",
      resume_state: result?.state || null,
      customer_artifact: result?.customer_artifact || null,
      employee_completion: result?.employee_completion || null,
      engineering_plan: result?.engineering_plan || result?.state?.engineering_plan || null,
      verified_engineering_memory: result?.verified_engineering_memory || null,
      engineering_memory_utility: result?.engineering_memory_utility || null,
      formed_engineering_skills: result?.formed_engineering_skills || null,
      engineering_skill_lifecycle: result?.engineering_skill_lifecycle || null,
      fast_start: result?.fast_start || null,
      execution_transport: result?.execution_transport || null,
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
