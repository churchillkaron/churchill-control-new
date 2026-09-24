import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) { return String(value ?? "").trim(); }

function migrationError(error) {
  const code = text(error?.code).toUpperCase();
  const message = text(error?.message);
  if (["PGRST205", "42P01"].includes(code) || (/marketing_campaign_message_deliveries/i.test(message) && /does not exist|schema cache|could not find/i.test(message))) {
    const unavailable = new Error("Campaign message delivery ledger migration is not deployed");
    unavailable.code = "MARKETING_CAMPAIGN_MESSAGE_LEDGER_MIGRATION_REQUIRED";
    unavailable.status = 503;
    return unavailable;
  }
  return error;
}

function providerMessageId(result = {}) {
  const output = result?.output?.output || result?.output || result || {};
  return text(
    output?.messages?.[0]?.id ||
    output?.sentMessages?.[0]?.message_id ||
    output?.sentMessages?.[0]?.id ||
    output?.message_id ||
    output?.id,
  ) || null;
}

export const MarketingCampaignMessageDeliveryRuntime = {
  deliveryKey({ fingerprint, channel, senderAssetId, partyId }) {
    return [text(fingerprint), text(channel).toLowerCase(), text(senderAssetId), text(partyId)].join(":");
  },

  async claim({ organizationId, marketingCampaignId, fingerprint, channel, senderAssetId, partyId, consentSnapshot = {} }) {
    if (!marketingCampaignId) throw new Error("marketing_campaign_id required for owned messaging execution");
    const deliveryKey = this.deliveryKey({ fingerprint, channel, senderAssetId, partyId });
    const row = {
      organization_id: organizationId,
      marketing_campaign_id: marketingCampaignId,
      plan_fingerprint: fingerprint,
      delivery_key: deliveryKey,
      channel: text(channel).toLowerCase(),
      sender_asset_id: senderAssetId,
      party_id: partyId,
      delivery_status: "SENDING",
      consent_snapshot: consentSnapshot,
      last_attempted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const inserted = await supabaseAdmin
      .from("marketing_campaign_message_deliveries")
      .insert(row)
      .select("*")
      .maybeSingle();
    if (!inserted.error && inserted.data) return { claimed: true, retry: false, delivery: inserted.data };
    if (inserted.error && text(inserted.error.code) !== "23505") throw migrationError(inserted.error);

    const existingResult = await supabaseAdmin
      .from("marketing_campaign_message_deliveries")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("delivery_key", deliveryKey)
      .maybeSingle();
    if (existingResult.error) throw migrationError(existingResult.error);
    const existing = existingResult.data;
    if (!existing) throw new Error("CAMPAIGN_DELIVERY_CLAIM_CONFLICT_WITHOUT_ROW");
    if (existing.delivery_status !== "FAILED") {
      return { claimed: false, retry: false, delivery: existing };
    }

    const retried = await supabaseAdmin
      .from("marketing_campaign_message_deliveries")
      .update({
        delivery_status: "SENDING",
        error_code: null,
        error_message: null,
        attempt_count: Number(existing.attempt_count || 1) + 1,
        last_attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", existing.id)
      .eq("delivery_status", "FAILED")
      .select("*")
      .maybeSingle();
    if (retried.error) throw migrationError(retried.error);
    if (!retried.data) return { claimed: false, retry: false, delivery: existing };
    return { claimed: true, retry: true, delivery: retried.data };
  },

  async markSent({ organizationId, deliveryId, providerId, result }) {
    const usageId = result?.usage?.id || null;
    const now = new Date().toISOString();
    const updated = await supabaseAdmin
      .from("marketing_campaign_message_deliveries")
      .update({
        delivery_status: "SENT",
        provider_id: providerId || null,
        provider_message_id: providerMessageId(result),
        service_usage_id: usageId,
        sent_at: now,
        updated_at: now,
      })
      .eq("organization_id", organizationId)
      .eq("id", deliveryId)
      .eq("delivery_status", "SENDING")
      .select("*")
      .maybeSingle();
    if (updated.error) throw migrationError(updated.error);
    if (!updated.data) throw new Error("CAMPAIGN_DELIVERY_SENT_STATE_CONFLICT");
    return updated.data;
  },

  async markFailed({ organizationId, deliveryId, error }) {
    const updated = await supabaseAdmin
      .from("marketing_campaign_message_deliveries")
      .update({
        delivery_status: "FAILED",
        error_code: text(error?.code) || "PROVIDER_EXECUTION_FAILED",
        error_message: text(error?.message).slice(0, 500) || "Provider execution failed",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", deliveryId)
      .eq("delivery_status", "SENDING")
      .select("*")
      .maybeSingle();
    if (updated.error) throw migrationError(updated.error);
    return updated.data || null;
  },
};

export default MarketingCampaignMessageDeliveryRuntime;
