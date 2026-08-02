import {
  getMarketingCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/MarketingCampaignAdapterRegistry";

import {
  validateCampaignPlanReadiness,
} from "@/lib/marketing/campaigns/UniversalCampaignPlan";

import {
  MarketingCampaignBuilderReadinessRuntime,
} from "@/lib/marketing/campaigns/MarketingCampaignBuilderReadinessRuntime";

function required(value, label) {
  if (value === undefined || value === null || value === "") {
    throw stageError({
      stage: "REQUEST_VALIDATION",
      code: "REQUIRED_VALUE_MISSING",
      message: `${label} is required`,
      correction: `Provide ${label.toLowerCase()} and retry.`,
    });
  }
  return value;
}

function stageError({
  stage,
  code,
  message,
  provider = null,
  channelId = null,
  correction = null,
  details = null,
  status = 400,
}) {
  const error = new Error(message);
  error.name = "CampaignExecutionError";
  error.stage = stage;
  error.code = code;
  error.provider = provider;
  error.channel_id = channelId;
  error.correction = correction;
  error.details = details;
  error.status = status;
  return error;
}

function publicError(error) {
  return {
    name: error?.name || "CampaignExecutionError",
    stage: error?.stage || "UNKNOWN",
    code: error?.code || "CAMPAIGN_EXECUTION_FAILED",
    provider: error?.provider || null,
    channel_id: error?.channel_id || null,
    message: error?.message || "Campaign execution failed",
    correction: error?.correction || null,
    details: error?.details || null,
  };
}

function readyChannelMap(readiness) {
  return new Map(
    (readiness?.channels || []).map((channel) => [channel.id, channel]),
  );
}

async function prepare({
  organizationId,
  entityId = null,
  plan,
  requireApproval,
}) {
  required(organizationId, "Organization id");
  required(plan, "Campaign plan");

  const validation = validateCampaignPlanReadiness(
    {
      ...plan,
      organization_id: organizationId,
      entity_id: entityId || plan.entity_id || null,
    },
    { requireApproval },
  );

  if (!validation.ready) {
    throw stageError({
      stage: requireApproval ? "PLAN_APPROVAL" : "PLAN_VALIDATION",
      code: requireApproval
        ? "CAMPAIGN_PLAN_NOT_EXECUTABLE"
        : "CAMPAIGN_PLAN_PREFLIGHT_FAILED",
      message: requireApproval
        ? "Campaign plan is not ready for execution"
        : "Campaign plan is not ready for provider preflight",
      correction: requireApproval
        ? "Resolve every plan blocker and record owner approval before wallet reservation."
        : "Resolve every plan blocker before requesting owner approval.",
      details: { blockers: validation.blockers },
    });
  }

  const normalizedPlan = validation.plan;
  const readiness = await MarketingCampaignBuilderReadinessRuntime.readiness({
    organizationId,
  });
  const channels = readyChannelMap(readiness);

  return {
    normalizedPlan,
    readiness,
    channels,
  };
}

function resolveAdapter(channelPlan, channels) {
  const channelReadiness = channels.get(channelPlan.channel_id);

  if (!channelReadiness?.available) {
    throw stageError({
      stage: "CHANNEL_READINESS",
      code: "CHANNEL_NOT_READY",
      channelId: channelPlan.channel_id,
      provider: channelPlan.provider,
      message: `${channelReadiness?.name || channelPlan.channel_id} is not ready for execution`,
      correction:
        channelReadiness?.reasons?.join("; ") ||
        "Install and configure the required organization service, provider connection and execution adapter.",
      details: channelReadiness || null,
    });
  }

  const adapter = getMarketingCampaignAdapter(channelPlan.channel_id);
  if (!adapter || adapter.status !== "ACTIVE") {
    throw stageError({
      stage: "ADAPTER_RESOLUTION",
      code: "CHANNEL_ADAPTER_UNAVAILABLE",
      channelId: channelPlan.channel_id,
      provider: channelPlan.provider,
      message: `No active execution adapter exists for ${channelPlan.channel_id}`,
      correction:
        "Implement and register the provider adapter before presenting this channel as executable.",
    });
  }

  return { adapter, channelReadiness };
}

export const MarketingCampaignExecutionRuntime = {
  async preflightPlan({
    organizationId,
    entityId = null,
    plan,
  }) {
    const { normalizedPlan, channels } = await prepare({
      organizationId,
      entityId,
      plan,
      requireApproval: false,
    });

    const results = [];
    for (const channelPlan of normalizedPlan.channels) {
      const { adapter, channelReadiness } = resolveAdapter(
        channelPlan,
        channels,
      );

      if (typeof adapter.preflight !== "function") {
        throw stageError({
          stage: "ADAPTER_PREFLIGHT",
          code: "CHANNEL_PREFLIGHT_UNAVAILABLE",
          channelId: channelPlan.channel_id,
          provider: channelPlan.provider,
          message: `No no-spend preflight exists for ${channelPlan.channel_id}`,
          correction:
            "Implement provider payload validation before enabling owner approval.",
        });
      }

      try {
        results.push(
          await adapter.preflight({
            organizationId,
            entityId,
            plan: normalizedPlan,
            channel: channelPlan,
            readiness: channelReadiness,
          }),
        );
      } catch (error) {
        if (error?.name === "CampaignExecutionError") {
          error.channel_id = error.channel_id || channelPlan.channel_id;
          error.provider = error.provider || channelPlan.provider;
          throw error;
        }
        throw stageError({
          stage: "ADAPTER_PREFLIGHT",
          code: "CHANNEL_PREFLIGHT_FAILED",
          channelId: channelPlan.channel_id,
          provider: channelPlan.provider,
          message: error?.message || "Channel preflight failed",
          correction:
            "Correct the provider-specific plan field before owner approval.",
        });
      }
    }

    return {
      success: true,
      organization_id: organizationId,
      entity_id: entityId || null,
      plan_version: normalizedPlan.version,
      execution_mode: "PREFLIGHT_ONLY",
      wallet_changed: false,
      campaign_created: false,
      result_count: results.length,
      results,
    };
  },

  async executeApprovedPlan({
    organizationId,
    entityId = null,
    plan,
  }) {
    const { normalizedPlan, channels } = await prepare({
      organizationId,
      entityId,
      plan,
      requireApproval: true,
    });

    const results = [];
    for (const channelPlan of normalizedPlan.channels) {
      const { adapter, channelReadiness } = resolveAdapter(
        channelPlan,
        channels,
      );

      try {
        const result = await adapter.execute({
          organizationId,
          entityId,
          plan: normalizedPlan,
          channel: channelPlan,
          readiness: channelReadiness,
        });
        results.push(result);
      } catch (error) {
        if (error?.name === "CampaignExecutionError") {
          error.channel_id = error.channel_id || channelPlan.channel_id;
          error.provider = error.provider || channelPlan.provider;
          throw error;
        }

        throw stageError({
          stage: "ADAPTER_EXECUTION",
          code: "CHANNEL_ADAPTER_EXECUTION_FAILED",
          channelId: channelPlan.channel_id,
          provider: channelPlan.provider,
          message: error?.message || "Channel adapter execution failed",
          correction:
            "Correct the provider-specific error and retry. No channel should be activated automatically.",
        });
      }
    }

    return {
      success: true,
      organization_id: organizationId,
      entity_id: entityId || null,
      plan_version: normalizedPlan.version,
      execution_mode: "PAUSED_FIRST",
      result_count: results.length,
      results,
    };
  },

  publicError,
};

export default MarketingCampaignExecutionRuntime;
