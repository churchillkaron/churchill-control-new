import {
  MarketingCampaignReadinessRuntime,
} from "@/lib/marketing/campaigns/MarketingCampaignReadinessRuntime";

import {
  getMarketingCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/MarketingCampaignAdapterRegistry";

function adapterReadiness(channel = {}) {
  const adapter = getMarketingCampaignAdapter(channel.id);
  const active = Boolean(adapter && adapter.status === "ACTIVE");

  if (active) {
    return {
      ...channel,
      adapter_id: adapter.id,
      adapter_version: adapter.version || null,
      adapter_status: adapter.status,
    };
  }

  return {
    ...channel,
    available: false,
    readiness_state:
      channel.readiness_state === "NOT_REGISTERED"
        ? "NOT_REGISTERED"
        : "ADAPTER_REQUIRED",
    reasons: [
      ...(channel.reasons || []),
      "No active universal campaign execution adapter is registered",
    ],
    adapter_id: adapter?.id || null,
    adapter_version: adapter?.version || null,
    adapter_status: adapter?.status || "NOT_REGISTERED",
    available_networks: [],
    available_destinations: [],
  };
}

export const MarketingCampaignBuilderReadinessRuntime = {
  async readiness({ organizationId }) {
    const readiness = await MarketingCampaignReadinessRuntime.readiness({
      organizationId,
    });

    const channels = (readiness.channels || []).map(adapterReadiness);
    const connectedChannels = channels
      .filter((channel) => channel.available)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        kind: channel.kind,
        provider: channel.provider,
        capability: channel.capability,
        service_id: channel.service_id,
        networks: channel.available_networks || [],
        destinations:
          channel.available_destinations ||
          channel.destinations ||
          [],
        formats: channel.formats || [],
        readiness_state: channel.readiness_state,
        adapter_id: channel.adapter_id,
        adapter_version: channel.adapter_version,
      }));

    return {
      ...readiness,
      ready_channel_count: connectedChannels.length,
      connected_channels: connectedChannels,
      channels,
    };
  },
};

export default MarketingCampaignBuilderReadinessRuntime;
