export const dynamic = "force-dynamic";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  MarketingCampaignExecutionRuntime,
} from "@/lib/marketing/campaigns/MarketingCampaignExecutionRuntime";

import { settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";

import { campaignPlanFingerprint } from "@/lib/marketing/campaigns/CampaignPlanFingerprint";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

function assertExpectedPlanFingerprint(plan, expected) {
  const expectedValue = String(expected || "").trim().toLowerCase();
  if (!expectedValue) return;
  const actual = campaignPlanFingerprint(plan);
  if (actual !== expectedValue) {
    const error = new Error("Campaign plan fingerprint does not match the reviewed snapshot");
    error.name = "CampaignExecutionError";
    error.stage = "PLAN_INTEGRITY";
    error.code = "CAMPAIGN_PLAN_FINGERPRINT_MISMATCH";
    error.correction = "Reload the campaign and review the current plan before preflight or approval.";
    error.details = { expected_fingerprint: expectedValue, actual_fingerprint: actual };
    error.status = 409;
    throw error;
  }
}

function safeExecutionEvidence(result, fingerprint) {
  const now = new Date().toISOString();
  return Object.fromEntries((result?.results || []).map((item) => {
    const provider = String(item?.provider || item?.channel_id || "unknown").trim().toLowerCase();
    const nested = item?.result || {};
    const managed = nested?.campaign || {};
    const providerResult = nested?.provider_result || managed?.provider_result || {};
    return [provider, {
      provider,
      channel_id: item?.channel_id || provider,
      adapter: item?.adapter || null,
      status: item?.status || nested?.status || managed?.status || "PAUSED",
      delivery_networks: Array.isArray(item?.delivery_networks) ? item.delivery_networks : [],
      executed_at: now,
      plan_fingerprint: fingerprint || null,
      managed_media_campaign_id: managed?.id || null,
      provider_campaign_id: managed?.provider_campaign_id || providerResult?.campaign_id || null,
      provider_ad_set_id: managed?.provider_ad_set_id || providerResult?.ad_set_id || null,
      provider_creative_id: managed?.provider_creative_id || providerResult?.creative_id || null,
      provider_ad_id: managed?.provider_ad_id || providerResult?.ad_id || null,
      reserved_amount: Number(nested?.reserved_amount || managed?.reserved_amount || 0),
      currency: nested?.currency || managed?.currency || null,
      activation_required: nested?.activation_required !== false,
    }];
  }));
}

function planProvider(plan = {}) {
  const channel = Array.isArray(plan.channels) ? plan.channels[0] : null;
  return String(channel?.channel_id || channel?.provider || "").trim().toLowerCase();
}

async function assertProviderNotAlreadyCreated({ organizationId, marketingCampaignId, provider }) {
  if (!marketingCampaignId || !provider) return;
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,campaign_content")
    .eq("id", marketingCampaignId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const missing = new Error("Marketing campaign not found");
    missing.status = 404;
    throw missing;
  }
  const evidence = data.campaign_content?.execution_evidence?.[provider];
  if (evidence && ["PAUSED", "ACTIVE"].includes(String(evidence.status || "").toUpperCase())) {
    const duplicate = new Error(`${provider} provider campaign has already been created for this Marketing Campaign`);
    duplicate.name = "CampaignExecutionError";
    duplicate.stage = "EXECUTION_IDEMPOTENCY";
    duplicate.code = "PROVIDER_CAMPAIGN_ALREADY_CREATED";
    duplicate.correction = "Use the existing managed-media campaign instead of creating another provider campaign.";
    duplicate.details = { provider, evidence };
    duplicate.status = 409;
    throw duplicate;
  }

  const { data: managedRows, error: managedError } = await supabaseAdmin
    .from("managed_media_campaigns")
    .select("id,status,provider,provider_campaign_id,metadata")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .contains("metadata", { marketing_campaign_id: String(marketingCampaignId) })
    .in("status", ["RESERVED", "PAUSED", "ACTIVE"])
    .limit(1);
  if (managedError) throw managedError;
  if (managedRows?.length) {
    const managed = managedRows[0];
    const duplicate = new Error(`${provider} managed-media campaign already exists for this Marketing Campaign`);
    duplicate.name = "CampaignExecutionError";
    duplicate.stage = "EXECUTION_IDEMPOTENCY";
    duplicate.code = "MANAGED_MEDIA_CAMPAIGN_ALREADY_EXISTS";
    duplicate.correction = "Recover or reconcile the existing managed-media campaign instead of creating another provider campaign.";
    duplicate.details = { provider, managed_media_campaign: managed };
    duplicate.status = 409;
    throw duplicate;
  }
}

async function persistExecutionEvidence({ organizationId, marketingCampaignId, result, fingerprint }) {
  if (!marketingCampaignId) return;
  const { data: campaign, error: readError } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,organization_id,campaign_content")
    .eq("id", marketingCampaignId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (readError) throw readError;
  if (!campaign) {
    const error = new Error("Marketing campaign not found for execution evidence");
    error.status = 404;
    throw error;
  }

  const current = campaign.campaign_content && typeof campaign.campaign_content === "object" ? campaign.campaign_content : {};
  const evidence = safeExecutionEvidence(result, fingerprint);
  const nextEvidence = { ...(current.execution_evidence || {}), ...evidence };
  const reservedTotal = Object.values(nextEvidence).reduce((sum, item) => sum + Number(item?.reserved_amount || 0), 0);
  const { error: updateError } = await supabaseAdmin
    .from("marketing_campaigns")
    .update({
      campaign_content: {
        ...current,
        execution_evidence: nextEvidence,
        spend_state: "reserved_paused",
        reserved_media_amount: reservedTotal,
        execution_evidence_updated_at: new Date().toISOString(),
      },
    })
    .eq("id", marketingCampaignId)
    .eq("organization_id", organizationId);
  if (updateError) throw updateError;
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

    assertExpectedPlanFingerprint(
      body.plan,
      body.expectedPlanFingerprint || body.expected_plan_fingerprint,
    );

    if (action === "preflight") {
      const result = await MarketingCampaignExecutionRuntime.preflightPlan({
        organizationId: access.organizationId,
        entityId: body.entityId || body.entity_id || null,
        plan: body.plan,
      });

      return Response.json({ success: true, data: result });
    }

    if (action === "status") {
      const usageId = String(body.usageId || body.usage_id || "").trim();
      if (!usageId) {
        return Response.json({
          success: false,
          error: {
            stage: "REQUEST_VALIDATION",
            code: "CAMPAIGN_EXECUTION_USAGE_ID_REQUIRED",
            message: "usageId is required for campaign provider status",
          },
        }, { status: 400 });
      }

      const usage = await UsageRuntime.get(usageId);
      if (!usage || String(usage.organization_id) !== String(access.organizationId)) {
        return Response.json({
          success: false,
          error: {
            stage: "AUTHORIZATION",
            code: "CAMPAIGN_EXECUTION_USAGE_NOT_FOUND",
            message: "Campaign provider execution was not found for this organization",
          },
        }, { status: 404 });
      }

      const provider = String(usage.provider || "").trim();
      const providerJobId = String(usage.provider_request_id || usage.metadata?.provider_request_id || "").trim();
      if (!provider || !providerJobId) {
        return Response.json({
          success: false,
          error: {
            stage: "EXECUTION_STATUS",
            code: "CAMPAIGN_PROVIDER_JOB_NOT_BOUND",
            message: "This campaign execution is not bound to a pending provider job",
          },
        }, { status: 409 });
      }

      const result = await settlePendingService({
        organization_id: access.organizationId,
        provider,
        provider_job_id: providerJobId,
        usage_id: usage.id,
        pricing: usage.metadata?.reservation_pricing || {},
        quantity: usage.quantity || 1,
        unit: usage.unit || "request",
        credential_id: usage.credential_id || usage.metadata?.credential_id || null,
        started_at: usage.execution_started_at || usage.created_at || null,
        metadata: {
          campaign_status_check: true,
          campaign_execution_adapter: usage.metadata?.campaign_execution_adapter || null,
          campaign_plan_fingerprint: usage.metadata?.campaign_plan_fingerprint || null,
          campaign_network: usage.metadata?.campaign_network || null,
        },
      });

      return Response.json({ success: result?.failed !== true, data: result }, { status: result?.failed ? 502 : 200 });
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
              "Use preflight, status or approve_and_execute.",
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

    const marketingCampaignId = body.marketingCampaignId || body.marketing_campaign_id || null;
    const provider = planProvider(body.plan);
    await assertProviderNotAlreadyCreated({
      organizationId: access.organizationId,
      marketingCampaignId,
      provider,
    });

    const result = await MarketingCampaignExecutionRuntime.executeApprovedPlan({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id || null,
      marketingCampaignId,
      plan: approvedPlan(body.plan, access),
    });

    let evidencePersisted = true;
    let evidenceWarning = null;
    try {
      await persistExecutionEvidence({
        organizationId: access.organizationId,
        marketingCampaignId,
        result,
        fingerprint: body.expectedPlanFingerprint || body.expected_plan_fingerprint || null,
      });
    } catch (evidenceError) {
      evidencePersisted = false;
      evidenceWarning = "Provider campaign was created PAUSED, but Marketing Campaign evidence could not be synchronized. Do not retry provider creation.";
    }

    return Response.json({
      success: true,
      data: {
        ...result,
        marketing_campaign_evidence: {
          persisted: evidencePersisted,
          warning: evidenceWarning,
        },
      },
    });
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
