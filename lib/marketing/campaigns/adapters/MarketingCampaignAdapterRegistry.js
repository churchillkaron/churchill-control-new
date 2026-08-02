import {
  MetaCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/MetaCampaignAdapter";

const ADAPTERS = Object.freeze({
  meta: MetaCampaignAdapter,
});

export function getMarketingCampaignAdapter(channelId) {
  return ADAPTERS[String(channelId || "").trim().toLowerCase()] || null;
}

export function listMarketingCampaignAdapters() {
  return Object.values(ADAPTERS).map((adapter) => ({
    id: adapter.id,
    version: adapter.version,
    status: adapter.status,
  }));
}

export default ADAPTERS;
