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
import {
  loadLatestProductEngineeringPortfolio,
  compactProductEngineeringPortfolio,
  AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioRuntime";
import {
  attachOwnerControlToProductEngineeringPortfolioProjection,
  governProductEngineeringPortfolioWithOwnerControl,
  loadProductEngineeringPortfolioOwnerControl,
  AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioOwnerControlRuntime";

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

function safePortfolioUnavailable(error) {
  return {
    contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT,
    found: false,
    unavailable: true,
    failure_reason: text(error?.message || error).slice(0, 500) || null,
    roadmap: [],
    owner_control: null,
    current_main_is_authoritative: true,
    queued_objectives_are_provisional: true,
    raw_source_persisted: false,
    raw_patch_persisted: false,
    raw_reasoning_persisted: false,
    automatic_commit_allowed: false,
    automatic_deploy_allowed: false,
    authorization_effect: "NONE",
  };
}

async function visiblePortfolio({ context, loaded }) {
  if (loaded?.error) return safePortfolioUnavailable(loaded.error);
  if (!loaded?.found || !loaded.portfolio) return null;
  try {
    const controlLoaded = await loadProductEngineeringPortfolioOwnerControl({
      context,
      portfolioId: loaded.portfolio.portfolio_id,
    });
    const governed = governProductEngineeringPortfolioWithOwnerControl(
      loaded.portfolio,
      controlLoaded.control,
    );
    return {
      ...attachOwnerControlToProductEngineeringPortfolioProjection({
        compactPortfolio: compactProductEngineeringPortfolio(governed),
        governedPortfolio: governed,
        control: controlLoaded.control,
      }),
      found: true,
    };
  } catch (error) {
    return safePortfolioUnavailable(error);
  }
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
    const [loaded, portfolioLoaded] = await Promise.all([
      loadCodeAILiveProgress({ context }),
      loadLatestProductEngineeringPortfolio({ context }).catch((error) => ({
        found: false,
        error,
        portfolio: null,
      })),
    ]);
    const progress = loaded.live_progress || null;
    const productEngineeringPortfolio = await visiblePortfolio({
      context,
      loaded: portfolioLoaded,
    });

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

    const visibleProgress = progress
      ? {
          ...progress,
          engineering_intelligence: engineeringIntelligence,
          product_engineering_portfolio: productEngineeringPortfolio,
        }
      : productEngineeringPortfolio
        ? {
            contract: CODE_AI_LIVE_PROGRESS_CONTRACT,
            mission_id: null,
            objective: productEngineeringPortfolio.business_goal || null,
            repository_url: productEngineeringPortfolio.repository_url || null,
            ref: "main",
            state_status: "portfolio",
            files_changed: [],
            engineering_intelligence: engineeringIntelligence,
            product_engineering_portfolio: productEngineeringPortfolio,
            raw_reasoning_persisted: false,
            source_content_persisted: false,
            secrets_persisted: false,
          }
        : null;

    return Response.json({
      success: true,
      contract: CODE_AI_LIVE_PROGRESS_CONTRACT,
      found: loaded.found === true || Boolean(productEngineeringPortfolio),
      updated_at: loaded.updated_at || portfolioLoaded?.updated_at || null,
      live_progress: visibleProgress,
      engineering_intelligence: engineeringIntelligence,
      product_engineering_portfolio: productEngineeringPortfolio,
      product_engineering_portfolio_contract:
        AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT,
      product_engineering_portfolio_owner_control_contract:
        AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
      portfolio_current_main_is_authoritative: true,
      portfolio_queued_objectives_are_provisional: true,
      portfolio_current_objective_immutable_once_claimed: true,
      portfolio_owner_controls_future_execution_order_only: true,
      portfolio_parallel_code_execution_allowed: false,
      portfolio_automatic_commit_allowed: false,
      portfolio_production_deployment_allowed: false,
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
