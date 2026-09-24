import {
  MetaCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/MetaCampaignAdapter";
import {
  GoogleAdsCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/GoogleAdsCampaignAdapter";
import {
  OrganicSocialCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter";
import {
  OwnedMessagingCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/OwnedMessagingCampaignAdapter";

const ADAPTERS = Object.freeze({
  meta: MetaCampaignAdapter,
  google_ads: GoogleAdsCampaignAdapter,
  "google-ads": GoogleAdsCampaignAdapter,
  organic_social: OrganicSocialCampaignAdapter,
  email: OwnedMessagingCampaignAdapter,
  whatsapp: OwnedMessagingCampaignAdapter,
  line: OwnedMessagingCampaignAdapter,
  telegram: OwnedMessagingCampaignAdapter,
  sms: OwnedMessagingCampaignAdapter,
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
