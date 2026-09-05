import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  loadCodeAILiveProgress,
  CODE_AI_LIVE_PROGRESS_CONTRACT,
} from "@/lib/code/runtime/CodeAILiveProgressRuntime";
import {
  loadCodeAIEngineeringSkillVisibleReceipt,
  CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_CONTRACT,
} from "@/lib/code/runtime/CodeAIEngineeringSkillVisibleReceiptRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";

function text(value) {
  return String(value ?? "").trim();
}

function safeVisibleReceiptUnavailable(error) {
  return {
    contract: CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_CONTRACT,
    found: false,
    observations: [],
    observed_skill_count: 0,
    revalidated_skill_count: 0,
    contradicted_skill_count: 0,
    architecture_drift_signal_count: 0,
    verified_success_with_skill_revalidation_count: 0,
    learning_summary_status: "VISIBLE_RECEIPT_UNAVAILABLE",
    failure_reason: text(error?.message || error).slice(0, 500) || null,
    contains_raw_reasoning: false,
    contains_raw_source: false,
    contains_raw_patch: false,
    automatic_knowledge_promotion: false,
    reusable_platform_knowledge_written: false,
    authorization_effect: "NONE",
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    );
    if (!organizationId) {
      return Response.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const context = {
      organizationId,
      actor: { id: access.user?.id || access.userId },
    };
    const loaded = await loadCodeAILiveProgress({ context });
    const progress = loaded.live_progress || null;
    let engineeringIntelligence = {
      contract: CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_CONTRACT,
      found: false,
      observations: [],
      observed_skill_count: 0,
      revalidated_skill_count: 0,
      contradicted_skill_count: 0,
      architecture_drift_signal_count: 0,
      verified_success_with_skill_revalidation_count: 0,
      learning_summary_status: "NO_MISSION",
      contains_raw_reasoning: false,
      contains_raw_source: false,
      contains_raw_patch: false,
      automatic_knowledge_promotion: false,
      reusable_platform_knowledge_written: false,
      authorization_effect: "NONE",
    };

    if (progress?.mission_id) {
      try {
        engineeringIntelligence = await loadCodeAIEngineeringSkillVisibleReceipt({
          context,
          missionId: progress.mission_id,
          repositoryUrl: progress.repository_url || null,
          ref: progress.ref || null,
        });
      } catch (error) {
        engineeringIntelligence = safeVisibleReceiptUnavailable(error);
      }
    }

    return Response.json({
      success: true,
      contract: CODE_AI_LIVE_PROGRESS_CONTRACT,
      found: loaded.found === true,
      updated_at: loaded.updated_at || null,
      live_progress: progress
        ? {
            ...progress,
            engineering_intelligence: engineeringIntelligence,
          }
        : null,
      engineering_intelligence: engineeringIntelligence,
      contains_source_content: false,
      contains_raw_reasoning: false,
      contains_secrets: false,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        contract: CODE_AI_LIVE_PROGRESS_CONTRACT,
        error: text(error?.message || error).slice(0, 700) || "CODE_PROGRESS_FAILED",
        contains_source_content: false,
        contains_raw_reasoning: false,
        contains_secrets: false,
      },
      { status: 500 },
    );
  }
}
