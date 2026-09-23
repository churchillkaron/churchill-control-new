import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import "@/lib/platform/service-runtime/providers/whatsapp/WhatsAppCredentialRegistration";
import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

const PROVIDER = "whatsapp";
const CREDENTIAL_PURPOSE = "ORGANIZATION_WHATSAPP_BUSINESS";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function graphVersion() {
  const configured = text(process.env.META_GRAPH_API_VERSION);
  if (!configured) return "v23.0";
  return configured.startsWith("v") ? configured : `v${configured}`;
}

function safeFailure(code, message, details = {}) {
  return {
    success: false,
    healthy: false,
    checked_at: new Date().toISOString(),
    code,
    message,
    ...details,
  };
}

async function graphJson(path, accessToken) {
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${String(path).replace(/^\//, "")}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(
      payload?.error?.error_user_msg ||
        payload?.error?.message ||
        `WhatsApp diagnostic request failed (${response.status})`,
    );
    error.metaCode = payload?.error?.code || response.status;
    error.metaSubcode = payload?.error?.error_subcode || null;
    throw error;
  }

  return payload;
}

function matchingSubscription({ subscriptions, appId, webhookUrl }) {
  const rows = Array.isArray(subscriptions?.data) ? subscriptions.data : [];

  return rows.find((row) => {
    const rowAppId = text(row?.whatsapp_business_api_data?.id || row?.id);
    const rowCallbackUrl = text(row?.override_callback_uri);
    const appMatches = !appId || rowAppId === appId;
    const callbackMatches = !webhookUrl || rowCallbackUrl === webhookUrl;
    return appMatches && callbackMatches;
  }) || null;
}

export async function inspectWhatsAppConnection({ organization_id }) {
  const organizationId = text(organization_id);
  if (!organizationId) throw new Error("organization_id required");

  const connection = await ChannelConnectionRuntime.get({
    organization_id: organizationId,
    provider: PROVIDER,
  });

  if (!connection || upper(connection.status) !== "ACTIVE") {
    return safeFailure(
      "WHATSAPP_CONNECTION_NOT_ACTIVE",
      "WhatsApp Business is not actively connected for this organization.",
      { connected: false },
    );
  }

  const credentialId = text(connection.credentials_reference);
  if (!credentialId) {
    return safeFailure(
      "WHATSAPP_CREDENTIAL_REFERENCE_MISSING",
      "The active WhatsApp connection has no credential reference.",
      { connected: true },
    );
  }

  let credential;
  try {
    credential = await resolveProviderCredential({
      organization_id: organizationId,
      provider: PROVIDER,
      credential_id: credentialId,
    });
  } catch {
    return safeFailure(
      "WHATSAPP_CREDENTIAL_UNAVAILABLE",
      "The WhatsApp credential is registered but its runtime secret is unavailable.",
      { connected: true },
    );
  }

  if (!credential) {
    return safeFailure(
      "WHATSAPP_CREDENTIAL_NOT_FOUND",
      "The active WhatsApp credential could not be resolved.",
      { connected: true },
    );
  }

  const accessToken = text(credential.access_token);
  const connectionMetadata = connection.metadata || {};
  const phoneNumberId = text(credential.phone_number_id || connectionMetadata.phone_number_id);
  const wabaId = text(credential.waba_id || connectionMetadata.waba_id);

  if (!accessToken) {
    return safeFailure(
      "WHATSAPP_ACCESS_TOKEN_REQUIRED",
      "The WhatsApp access token is unavailable at runtime.",
      { connected: true },
    );
  }
  if (!phoneNumberId) {
    return safeFailure(
      "WHATSAPP_PHONE_NUMBER_ID_REQUIRED",
      "The connected WhatsApp phone number ID is missing.",
      { connected: true },
    );
  }
  if (!wabaId) {
    return safeFailure(
      "WHATSAPP_WABA_ID_REQUIRED",
      "The connected WhatsApp Business Account ID is missing.",
      { connected: true },
    );
  }

  try {
    const staffTemplateName = "avantiqo_staff_verification";
    const staffTemplateLanguage = "en_US";
    const [phone, waba, subscriptions, templates] = await Promise.all([
      graphJson(
        `${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,name_status,code_verification_status,platform_type`,
        accessToken,
      ),
      graphJson(`${encodeURIComponent(wabaId)}?fields=id,name`, accessToken),
      graphJson(`${encodeURIComponent(wabaId)}/subscribed_apps`, accessToken),
      graphJson(
        `${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(staffTemplateName)}&fields=id,name,status,category,language,components,quality_score`,
        accessToken,
      ),
    ]);

    const appId = text(process.env.META_APP_ID);
    const webhookUrl = text(connectionMetadata.webhook_url);
    const subscription = matchingSubscription({ subscriptions, appId, webhookUrl });
    const phoneMatches = text(phone?.id) === phoneNumberId;
    const wabaMatches = text(waba?.id) === wabaId;
    const webhookSubscribed = Boolean(subscription);
    const templateRows = Array.isArray(templates?.data) ? templates.data : [];
    const staffTemplate = templateRows.find((row) =>
      text(row?.name) === staffTemplateName &&
      (!staffTemplateLanguage || text(row?.language) === staffTemplateLanguage)
    ) || templateRows[0] || null;

    return {
      success: true,
      healthy: phoneMatches && wabaMatches && webhookSubscribed,
      checked_at: new Date().toISOString(),
      connected: true,
      token_accepted: true,
      phone: {
        id_matches: phoneMatches,
        display_phone_number: text(phone?.display_phone_number) || null,
        verified_name: text(phone?.verified_name) || null,
        quality_rating: text(phone?.quality_rating) || null,
        name_status: text(phone?.name_status) || null,
        code_verification_status: text(phone?.code_verification_status) || null,
        platform_type: text(phone?.platform_type) || null,
      },
      waba: {
        id_matches: wabaMatches,
        name: text(waba?.name) || null,
      },
      webhook: {
        subscribed: webhookSubscribed,
        callback_matches: webhookSubscribed,
      },
      staff_verification_template: staffTemplate ? {
        name: text(staffTemplate.name) || null,
        status: text(staffTemplate.status) || null,
        category: text(staffTemplate.category) || null,
        language: text(staffTemplate.language) || null,
        components: Array.isArray(staffTemplate.components) ? staffTemplate.components : [],
        quality_score: staffTemplate.quality_score || null,
      } : null,
    };
  } catch (error) {
    return safeFailure(
      "WHATSAPP_META_VALIDATION_FAILED",
      error?.message || "Meta rejected the WhatsApp connection validation request.",
      {
        connected: true,
        token_accepted: false,
        meta_code: error?.metaCode || null,
        meta_subcode: error?.metaSubcode || null,
      },
    );
  }
}

export const WhatsAppConnectionDiagnosticRuntime = {
  inspect: inspectWhatsAppConnection,
};
