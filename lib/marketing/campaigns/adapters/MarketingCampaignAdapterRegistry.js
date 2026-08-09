import {
  MetaCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/MetaCampaignAdapter";
import {
  GoogleAdsCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/GoogleAdsCampaignAdapter";

const ADAPTERS = Object.freeze({
  meta: MetaCampaignAdapter,
  google_ads: GoogleAdsCampaignAdapter,
  "google-ads": GoogleAdsCampaignAdapter,
});

export function getMarketingCampaignAdapter(channelId) {
  return ADAPTERS[String(channelId || "").trim().toLowerCase()] || null;
}

export function listMarketingCampaignAdapters() {
  return [...new Map(
    Object.values(ADAPTERS).map((adapter) => [adapter.id, adapter])
  ).values()].map((adapter) => ({
    id: adapter.id,
    version: adapter.version,
    status: adapter.status,
  }));
}

export default ADAPTERS;
