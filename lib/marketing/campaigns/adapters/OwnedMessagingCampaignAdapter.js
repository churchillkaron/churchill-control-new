import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { campaignPlanFingerprint } from "@/lib/marketing/campaigns/CampaignPlanFingerprint";
import { MarketingCampaignConsentRuntime } from "@/lib/marketing/campaigns/MarketingCampaignConsentRuntime";
import { MarketingCampaignUnsubscribeRuntime } from "@/lib/marketing/campaigns/MarketingCampaignUnsubscribeRuntime";
import { MarketingCampaignMessageDeliveryRuntime } from "@/lib/marketing/campaigns/MarketingCampaignMessageDeliveryRuntime";
import { translateOwnedMessagingCampaignPlan } from "@/lib/marketing/campaigns/adapters/OwnedMessagingCampaignPlanTranslator";
import { analyzeSmsSegments } from "@/lib/marketing/campaigns/SmsSegmentation";

function text(value) { return String(value ?? "").trim(); }

const RUNTIME = Object.freeze({
  email: { service_id: "email", capability: "communication.email.send", providers: new Set(["email", "email_google", "email_microsoft", "email_imap"]), asset_types: new Set(["business_mailbox"]) },
  whatsapp: { service_id: "whatsapp", capability: "communication.whatsapp.template", providers: new Set(["whatsapp"]), asset_types: new Set(["whatsapp_phone_number"]) },
  line: { service_id: "line", capability: "communication.line.send", providers: new Set(["line"]), asset_types: new Set(["line_official_account", "line_account"]) },
  telegram: { service_id: "telegram", capability: "communication.telegram.send", providers: new Set(["telegram"]), asset_types: new Set(["telegram_bot"]) },
  sms: { service_id: "sms", capability: "communication.sms.send", providers: new Set(["sms"]), asset_types: new Set(["sms_sender"]) },
});

function executionError({ stage, code, message, provider = "owned_messaging", correction = null, details = null }) {
  const error = new Error(message);
  error.name = "CampaignExecutionError";
  error.stage = stage;
  error.code = code;
  error.provider = provider;
  error.correction = correction;
  error.details = details;
  error.status = 400;
  return error;
}

async function senderAsset({ organizationId, translated }) {
  const runtime = RUNTIME[translated.channel_id];
  const { data, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,connection_id,channel_provider,asset_type,external_id,name,entity_id,metadata")
    .eq("organization_id", organizationId)
    .eq("id", translated.sender_asset_id)
    .maybeSingle();
  if (error) throw error;
  if (!data || !runtime.providers.has(text(data.channel_provider).toLowerCase()) || !runtime.asset_types.has(text(data.asset_type))) {
    throw executionError({
      stage: "CHANNEL_ASSET_PREFLIGHT",
      code: "OWNED_MESSAGING_SENDER_INVALID",
      provider: translated.channel_id,
      message: `Selected ${translated.channel_id} sender is not valid for this organization`,
      correction: "Reconnect or reselect the organization sender before approval.",
    });
  }
  return data;
}

async function preflightInternal({ organizationId, plan, channel }) {
  const translated = translateOwnedMessagingCampaignPlan({ plan, channel });
  const runtime = RUNTIME[translated.channel_id];
  if (!runtime) throw executionError({ stage: "ADAPTER_PREFLIGHT", code: "OWNED_MESSAGING_RUNTIME_MISSING", message: `No runtime contract exists for ${translated.channel_id}` });

  const [asset, service, audience] = await Promise.all([
    senderAsset({ organizationId, translated }),
    OrganizationServiceRuntime.get({ organization_id: organizationId, service_id: runtime.service_id }).catch(() => null),
    MarketingCampaignConsentRuntime.resolveEligibleAudience({
      organizationId,
      channel: translated.channel_id,
      partyIds: translated.recipient_party_ids,
      limit: Math.min(500, translated.recipient_party_ids.length),
    }),
  ]);

  if (!service || String(service.status || "").toUpperCase() !== "ACTIVE" || service.usage_enabled === false) {
    throw executionError({
      stage: "SERVICE_PREFLIGHT",
      code: "OWNED_MESSAGING_SERVICE_NOT_READY",
      provider: translated.channel_id,
      message: `${translated.channel_id} campaign service is not active for this organization`,
      correction: `Enable ${runtime.service_id} before campaign execution.`,
    });
  }

  if (translated.channel_id === "email") {
    const unsubscribe = MarketingCampaignUnsubscribeRuntime.readiness();
    if (!unsubscribe.ready) {
      throw executionError({
        stage: "UNSUBSCRIBE_PREFLIGHT",
        code: "EMAIL_UNSUBSCRIBE_RUNTIME_NOT_READY",
        provider: "email",
        message: "Email campaign unsubscribe runtime is not ready",
        correction: "Configure MARKETING_UNSUBSCRIBE_SECRET and the canonical application origin before activating Email campaigns.",
        details: { blockers: unsubscribe.blockers },
      });
    }
  }

  const eligibleByParty = new Set((audience.eligible || []).map((row) => String(row.party_id)));
  const blockedSelected = translated.recipient_party_ids.filter((partyId) => !eligibleByParty.has(String(partyId)));
  if (blockedSelected.length) {
    const blocked = (audience.blocked || []).filter((row) => blockedSelected.includes(String(row.party_id)));
    throw executionError({
      stage: "CONSENT_PREFLIGHT",
      code: "OWNED_MESSAGING_RECIPIENT_CONSENT_BLOCKED",
      provider: translated.channel_id,
      message: `${blockedSelected.length} selected recipient${blockedSelected.length === 1 ? " is" : "s are"} not eligible for ${translated.channel_id} campaign delivery`,
      correction: "Remove blocked recipients or record valid channel-specific consent before approval.",
      details: { blocked },
    });
  }

  return {
    translated,
    asset,
    runtime,
    recipients: audience.eligible,
  };
}

async function providerInput({ organizationId, translated, recipient, taskId }) {
  const message = [translated.message, translated.destination_url].filter(Boolean).join("\n\n").trim();
  if (translated.channel_id === "email") {
    const unsubscribe = MarketingCampaignUnsubscribeRuntime.issueToken({
      organizationId,
      partyId: recipient.party_id,
      channel: "email",
    });
    const body = `${message}

Unsubscribe: ${unsubscribe.url}`.trim();
    return {
      recipient: recipient.recipient,
      subject: translated.subject,
      message: body,
      list_unsubscribe_url: unsubscribe.url,
      quantity: 1,
    };
  }
  if (translated.channel_id === "whatsapp") {
    return {
      recipient: recipient.recipient,
      template: {
        name: translated.template_name,
        language: { code: translated.template_language },
        ...(translated.template_components.length ? { components: translated.template_components } : {}),
      },
      quantity: 1,
    };
  }
  if (translated.channel_id === "line") {
    return { user_id: recipient.recipient, message, retry_key: taskId, quantity: 1 };
  }
  if (translated.channel_id === "telegram") {
    return { recipient: recipient.recipient, message, quantity: 1 };
  }
  if (translated.channel_id === "sms") {
    return { recipient: recipient.recipient, message, quantity: 1 };
  }
  throw executionError({ stage: "PROVIDER_PAYLOAD", code: "OWNED_MESSAGING_PROVIDER_PAYLOAD_UNSUPPORTED", message: `No provider payload exists for ${translated.channel_id}` });
}

export const OwnedMessagingCampaignAdapter = {
  id: "owned_messaging",
  version: "OWNED_MESSAGING_GOVERNED_V1",
  status: "PENDING_CONSENT_GOVERNANCE",
  networks: ["email", "whatsapp", "line", "telegram", "sms"],

  async preflight({ organizationId, plan, channel }) {
    const prepared = await preflightInternal({ organizationId, plan, channel });
    return {
      adapter: this.version,
      channel_id: prepared.translated.channel_id,
      provider: prepared.translated.channel_id,
      ready: true,
      execution_mode: "PREFLIGHT_ONLY",
      wallet_changed: false,
      messages_sent: false,
      sender_asset_id: prepared.asset.id,
      recipient_count: prepared.recipients.length,
      ...(prepared.translated.channel_id === "sms" ? { sms: analyzeSmsSegments(prepared.translated.message) } : {}),
      recipients: prepared.recipients.map((row) => ({ party_id: row.party_id, display_name: row.display_name || null })),
    };
  },

  async execute({ organizationId, entityId = null, marketingCampaignId = null, plan, channel }) {
    if (this.status !== "ACTIVE") {
      throw executionError({
        stage: "ADAPTER_EXECUTION",
        code: "OWNED_MESSAGING_ACTIVATION_GATE_CLOSED",
        message: "Owned messaging campaign execution is not activated",
        correction: "Deploy and certify channel consent/suppression governance before activating this adapter.",
      });
    }
    const prepared = await preflightInternal({ organizationId, plan, channel });
    const fingerprint = campaignPlanFingerprint(plan);
    const results = [];
    for (const recipient of prepared.recipients) {
      const taskId = `campaign-owned:${fingerprint}:${prepared.translated.channel_id}:${prepared.asset.id}:${recipient.party_id}`;
      const claim = await MarketingCampaignMessageDeliveryRuntime.claim({
        organizationId,
        marketingCampaignId,
        fingerprint,
        channel: prepared.translated.channel_id,
        senderAssetId: prepared.asset.id,
        partyId: recipient.party_id,
        consentSnapshot: recipient.consent || {},
      });
      if (!claim.claimed) {
        results.push({
          party_id: recipient.party_id,
          provider: prepared.translated.channel_id,
          status: "SKIPPED_DUPLICATE_OR_IN_FLIGHT",
          delivery_id: claim.delivery?.id || null,
          delivery_status: claim.delivery?.delivery_status || null,
        });
        continue;
      }

      const providerId = prepared.translated.channel_id === "email"
        ? text(prepared.asset.channel_provider).toLowerCase()
        : prepared.translated.channel_id;
      try {
        const result = await executeService({
          organization_id: organizationId,
          entity_id: entityId,
          service_id: prepared.runtime.service_id,
          provider_id: providerId,
          capability: prepared.runtime.capability,
          input: await providerInput({ organizationId, translated: prepared.translated, recipient, taskId }),
          metadata: {
            task_id: taskId,
            campaign_execution_adapter: this.version,
            campaign_plan_fingerprint: fingerprint,
            campaign_id: marketingCampaignId,
            campaign_channel_id: prepared.translated.channel_id,
            campaign_sender_asset_id: prepared.asset.id,
            campaign_recipient_party_id: recipient.party_id,
            campaign_delivery_id: claim.delivery.id,
            owner_approval_id: plan.approval?.approved_by || null,
            owner_approved_at: plan.approval?.approved_at || null,
          },
          category: "MARKETING_CAMPAIGN_MESSAGE",
        });
        const evidence = await MarketingCampaignMessageDeliveryRuntime.markSent({
          organizationId,
          deliveryId: claim.delivery.id,
          providerId,
          result,
        });
        results.push({
          party_id: recipient.party_id,
          provider: prepared.translated.channel_id,
          status: "SENT_OR_PROVIDER_ACCEPTED",
          delivery_id: evidence.id,
          provider_message_id: evidence.provider_message_id || null,
          service_usage_id: evidence.service_usage_id || null,
          retry: claim.retry === true,
        });
      } catch (error) {
        await MarketingCampaignMessageDeliveryRuntime.markFailed({
          organizationId,
          deliveryId: claim.delivery.id,
          error,
        }).catch(() => null);
        throw error;
      }
    }
    return {
      adapter: this.version,
      channel_id: prepared.translated.channel_id,
      status: "DELIVERED_OR_PROVIDER_ACCEPTED",
      result_count: results.length,
      sent_count: results.filter((item) => item.status === "SENT_OR_PROVIDER_ACCEPTED").length,
      skipped_count: results.filter((item) => item.status === "SKIPPED_DUPLICATE_OR_IN_FLIGHT").length,
      results,
    };
  },
};

export default OwnedMessagingCampaignAdapter;
