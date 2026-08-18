import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function secret() {
  const value = text(process.env.MARKETING_ATTRIBUTION_SIGNING_SECRET);
  if (!value) throw new Error("MARKETING_ATTRIBUTION_SIGNING_SECRET is not configured");
  return value;
}

function canonical({ organizationId, marketingCampaignId, managedMediaCampaignId = null, providerId = null, providerCampaignId = null }) {
  return [
    text(organizationId),
    text(marketingCampaignId),
    text(managedMediaCampaignId),
    text(providerId),
    text(providerCampaignId),
  ].join("|");
}

function signature(context) {
  return crypto
    .createHmac("sha256", secret())
    .update(canonical(context))
    .digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function campaignContext({ organizationId, marketingCampaignId, managedMediaCampaignId = null }) {
  const campaignResult = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,organization_id,campaign_name")
    .eq("id", marketingCampaignId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (campaignResult.error) throw campaignResult.error;
  if (!campaignResult.data) throw new Error("Marketing campaign not found for organization");

  let managed = null;
  if (managedMediaCampaignId) {
    const managedResult = await supabaseAdmin
      .from("managed_media_campaigns")
      .select("id,organization_id,provider,provider_campaign_id")
      .eq("id", managedMediaCampaignId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (managedResult.error) throw managedResult.error;
    if (!managedResult.data) throw new Error("Managed media campaign not found for organization");
    managed = managedResult.data;
  }

  return {
    campaign: campaignResult.data,
    managed,
  };
}

export const MarketingAttributionTrackingRuntime = {
  async create({
    organizationId,
    marketingCampaignId,
    managedMediaCampaignId = null,
    providerId = null,
    providerCampaignId = null,
    destinationUrl,
    utm = {},
  }) {
    const organization = text(organizationId);
    const campaignId = text(marketingCampaignId);
    if (!organization) throw new Error("organizationId required");
    if (!campaignId) throw new Error("marketingCampaignId required");

    const { campaign, managed } = await campaignContext({
      organizationId: organization,
      marketingCampaignId: campaignId,
      managedMediaCampaignId: text(managedMediaCampaignId) || null,
    });

    const context = {
      organizationId: organization,
      marketingCampaignId: campaign.id,
      managedMediaCampaignId: managed?.id || null,
      providerId: text(providerId || managed?.provider || "internal"),
      providerCampaignId: text(providerCampaignId || managed?.provider_campaign_id) || null,
    };

    const sig = signature(context);
    const fields = {
      avq_oid: context.organizationId,
      avq_mid: context.marketingCampaignId,
      avq_mmcid: context.managedMediaCampaignId || "",
      avq_pid: context.providerId || "",
      avq_pcid: context.providerCampaignId || "",
      avq_sig: sig,
    };

    let tracked_url = null;
    if (text(destinationUrl)) {
      const url = new URL(destinationUrl);
      if (!["https:", "http:"].includes(url.protocol)) {
        throw new Error("Marketing destination URL must use HTTP or HTTPS");
      }
      for (const [key, value] of Object.entries(fields)) {
        if (value) url.searchParams.set(key, value);
      }
      const normalizedUtm = object(utm);
      const defaults = {
        utm_source: context.providerId || "avantiqo",
        utm_medium: managed ? "paid" : "campaign",
        utm_campaign: campaign.campaign_name || campaign.id,
      };
      for (const [key, value] of Object.entries({ ...defaults, ...normalizedUtm })) {
        if (text(value)) url.searchParams.set(key, text(value));
      }
      tracked_url = url.toString();
    }

    return {
      tracking_version: "AVQ_ATTRIBUTION_V1",
      campaign_name: campaign.campaign_name,
      fields,
      tracked_url,
    };
  },

  verify(input = {}) {
    const context = {
      organizationId: text(input.organizationId || input.organization_id || input.avq_oid),
      marketingCampaignId: text(input.marketingCampaignId || input.marketing_campaign_id || input.avq_mid),
      managedMediaCampaignId: text(input.managedMediaCampaignId || input.managed_media_campaign_id || input.avq_mmcid) || null,
      providerId: text(input.providerId || input.provider_id || input.avq_pid) || null,
      providerCampaignId: text(input.providerCampaignId || input.provider_campaign_id || input.avq_pcid) || null,
    };
    const supplied = text(input.signature || input.sig || input.avq_sig);
    if (!context.organizationId || !context.marketingCampaignId || !supplied) {
      return { valid: false, reason: "ATTRIBUTION_CONTEXT_INCOMPLETE", context };
    }
    const expected = signature(context);
    if (!safeEqual(expected, supplied)) {
      return { valid: false, reason: "ATTRIBUTION_SIGNATURE_INVALID", context };
    }
    return { valid: true, context };
  },
};
