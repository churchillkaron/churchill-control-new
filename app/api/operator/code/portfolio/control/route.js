import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  loadProductEngineeringPortfolio,
  loadLatestProductEngineeringPortfolio,
  compactProductEngineeringPortfolio,
} from "@/lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioRuntime";
import {
  applyProductEngineeringPortfolioOwnerDecision,
  attachOwnerControlToProductEngineeringPortfolioProjection,
  compactProductEngineeringPortfolioOwnerControl,
  governProductEngineeringPortfolioWithOwnerControl,
  loadProductEngineeringPortfolioOwnerControl,
  AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioOwnerControlRuntime";

export const runtime = "nodejs";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const ALLOWED_ACTIONS = new Set([
  "PAUSE",
  "RESUME",
  "PROMOTE",
  "DEFER",
  "REMOVE",
  "RESTORE",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizedAction(value) {
  return text(value, 80).toUpperCase().replace(/[\s-]+/g, "_");
}

function publicError(error) {
  const code = text(error?.message || error, 180) || "PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_FAILED";
  const status = code.endsWith("_NOT_FOUND") ? 404
    : code.endsWith("_AMBIGUOUS") || code.endsWith("_REVISION_CONFLICT") ? 409
      : code.endsWith("_IMMUTABLE") ? 409
        : code.includes("REQUIRED") || code.includes("INVALID") ? 400
          : 500;
  return { code, status };
}

async function accessContext(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredPermission: REQUIRED_PERMISSION,
  });
  if (!access.success) return { access, context: null };
  return {
    access,
    context: {
      organizationId,
      actor: { id: access.user?.id || access.userId },
    },
  };
}

async function resolvePortfolio({ context, portfolioId }) {
  if (portfolioId) {
    return loadProductEngineeringPortfolio({ context, portfolioId });
  }
  return loadLatestProductEngineeringPortfolio({ context });
}

function visiblePortfolio(portfolio, control) {
  const governed = governProductEngineeringPortfolioWithOwnerControl(portfolio, control);
  return attachOwnerControlToProductEngineeringPortfolioProjection({
    compactPortfolio: compactProductEngineeringPortfolio(governed),
    governedPortfolio: governed,
    control,
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
      160,
    );
    const portfolioId = text(
      url.searchParams.get("portfolioId") || url.searchParams.get("portfolio_id"),
      200,
    ) || null;
    if (!organizationId) {
      return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
    }
    const { access, context } = await accessContext(request, organizationId);
    if (!access.success) {
      return Response.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    const loaded = await resolvePortfolio({ context, portfolioId });
    if (!loaded.found || !loaded.portfolio) {
      return Response.json({ success: true, found: false, portfolio: null, owner_control: null });
    }
    const controlLoaded = await loadProductEngineeringPortfolioOwnerControl({
      context,
      portfolioId: loaded.portfolio.portfolio_id,
    });
    return Response.json({
      success: true,
      found: true,
      contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
      portfolio: visiblePortfolio(loaded.portfolio, controlLoaded.control),
      owner_control: compactProductEngineeringPortfolioOwnerControl(
        controlLoaded.control,
        loaded.portfolio,
      ),
      current_objective_immutable_once_claimed: true,
      owner_controls_future_execution_order_only: true,
      source_code_mutated: false,
      commit_performed: false,
      production_deployed: false,
    });
  } catch (error) {
    const failure = publicError(error);
    return Response.json({ success: false, error: failure.code }, { status: failure.status });
  }
}

export async function POST(request) {
  try {
    const body = object(await request.json().catch(() => ({})));
    const organizationId = text(body.organizationId || body.organization_id, 160);
    const portfolioId = text(body.portfolioId || body.portfolio_id, 200) || null;
    const action = normalizedAction(body.action);
    if (!organizationId) {
      return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
    }
    if (!ALLOWED_ACTIONS.has(action)) {
      return Response.json(
        { success: false, error: "PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_ACTION_INVALID" },
        { status: 400 },
      );
    }
    const { access, context } = await accessContext(request, organizationId);
    if (!access.success) {
      return Response.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    const loaded = await resolvePortfolio({ context, portfolioId });
    if (!loaded.found || !loaded.portfolio) {
      return Response.json(
        { success: false, error: "PRODUCT_ENGINEERING_PORTFOLIO_NOT_FOUND" },
        { status: 404 },
      );
    }
    const result = await applyProductEngineeringPortfolioOwnerDecision({
      context,
      portfolio: loaded.portfolio,
      action,
      nodeId: text(body.nodeId || body.node_id, 200) || null,
      objectiveQuery: text(body.objective || body.objective_query, 1800) || null,
      reason: text(body.reason, 800) || null,
      source: "OWNER_CONTROL_API",
      expectedControlRevision:
        body.expectedControlRevision ?? body.expected_control_revision ?? null,
    });
    return Response.json({
      success: true,
      contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
      action,
      decision: result.decision,
      owner_control: result.control,
      portfolio: visiblePortfolio(result.governed_portfolio, result.control),
      current_objective_immutable_once_claimed: true,
      owner_controls_future_execution_order_only: true,
      source_code_mutated: false,
      commit_performed: false,
      production_deployed: false,
      authorization_effect: "NONE",
    });
  } catch (error) {
    const failure = publicError(error);
    return Response.json({ success: false, error: failure.code }, { status: failure.status });
  }
}
