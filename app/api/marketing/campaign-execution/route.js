export const dynamic = "force-dynamic";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  MarketingCampaignExecutionRuntime,
} from "@/lib/marketing/campaigns/MarketingCampaignExecutionRuntime";

function approvedPlan(plan, access) {
  return {
    ...(plan || {}),
    approval: {
      ...(plan?.approval || {}),
      required: true,
      approved: true,
      approved_by:
        access.userId ||
        access.user?.id ||
        access.access?.userId ||
        null,
      approved_at: new Date().toISOString(),
      source: "AUTHENTICATED_OWNER_ACTION",
    },
  };
}

function denied(access) {
  return Response.json(
    {
      success: false,
      error: {
        stage: "AUTHORIZATION",
        code: "ORGANIZATION_ACCESS_DENIED",
        message: access.error || "Organization access denied",
        correction:
          "Use an authorized organization and a user with marketing campaign management permission.",
      },
    },
    { status: access.status || 403 },
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body.action || "preflight")
      .trim()
      .toLowerCase();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredPermission: "marketing.ads.manage",
    });

    if (!access.success) return denied(access);

    if (action === "preflight") {
      const result = await MarketingCampaignExecutionRuntime.preflightPlan({
        organizationId: access.organizationId,
        entityId: body.entityId || body.entity_id || null,
        plan: body.plan,
      });

      return Response.json({ success: true, data: result });
    }

    if (action !== "approve_and_execute") {
      return Response.json(
        {
          success: false,
          error: {
            stage: "REQUEST_VALIDATION",
            code: "CAMPAIGN_EXECUTION_ACTION_INVALID",
            message: `Unsupported campaign execution action: ${action}`,
            correction:
              "Use preflight or approve_and_execute.",
          },
        },
        { status: 400 },
      );
    }

    if (body.confirmOwnerApproval !== true) {
      return Response.json(
        {
          success: false,
          error: {
            stage: "PLAN_APPROVAL",
            code: "OWNER_APPROVAL_CONFIRMATION_REQUIRED",
            message:
              "Explicit owner approval confirmation is required before wallet reservation",
            correction:
              "Review the complete campaign plan and confirm owner approval in the Campaign Builder.",
          },
        },
        { status: 400 },
      );
    }

    const result = await MarketingCampaignExecutionRuntime.executeApprovedPlan({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id || null,
      plan: approvedPlan(body.plan, access),
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: MarketingCampaignExecutionRuntime.publicError(error),
      },
      { status: error?.status || 500 },
    );
  }
}
