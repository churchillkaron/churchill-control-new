function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }

const SUPPORTED = new Set(["email", "whatsapp", "line", "telegram", "sms"]);

function executionError({ code, message, correction = null, details = null }) {
  const error = new Error(message);
  error.name = "CampaignExecutionError";
  error.stage = "CHANNEL_TRANSLATION";
  error.code = code;
  error.provider = "owned_messaging";
  error.correction = correction;
  error.details = details;
  error.status = 400;
  return error;
}

export function translateOwnedMessagingCampaignPlan({ plan, channel }) {
  const channelId = text(channel?.channel_id).toLowerCase();
  if (!SUPPORTED.has(channelId)) {
    throw executionError({
      code: "OWNED_MESSAGING_CHANNEL_UNSUPPORTED",
      message: `Owned messaging channel ${channelId || "missing"} is not supported`,
    });
  }

  const settings = channel?.provider_settings || {};
  const senderAssetId = text(settings.sender_asset_id);
  const recipientPartyIds = [...new Set(list(settings.recipient_party_ids).map(text).filter(Boolean))];
  const message = text(settings.message || plan?.creative?.primary_text);
  const subject = text(settings.subject);
  const frequencyCap = Number(settings.frequency_cap || 1);

  if (!senderAssetId) {
    throw executionError({
      code: "OWNED_MESSAGING_SENDER_REQUIRED",
      message: `${channelId} campaign requires a connected sender asset`,
      correction: "Choose the organization sender/mailbox before approval.",
    });
  }
  if (!recipientPartyIds.length) {
    throw executionError({
      code: "OWNED_MESSAGING_EXPLICIT_RECIPIENTS_REQUIRED",
      message: `${channelId} campaign requires an explicit reviewed recipient set`,
      correction: "Select customers and run consent eligibility preview before approval.",
    });
  }
  if (!Number.isFinite(frequencyCap) || frequencyCap !== 1) {
    throw executionError({
      code: "OWNED_MESSAGING_FREQUENCY_CAP_UNSUPPORTED",
      message: "The first certified owned-messaging campaign adapter requires a frequency cap of exactly 1 send per recipient",
      correction: "Set frequency cap to 1. Repeated campaign delivery requires a later certified cadence policy.",
    });
  }
  if (channelId === "email") {
    if (!subject) throw executionError({ code: "EMAIL_CAMPAIGN_SUBJECT_REQUIRED", message: "Email campaign requires a subject" });
    if (!message) throw executionError({ code: "EMAIL_CAMPAIGN_BODY_REQUIRED", message: "Email campaign requires message body" });
  }
  if (channelId === "whatsapp") {
    if (!text(settings.template_name) || !text(settings.template_language)) {
      throw executionError({
        code: "WHATSAPP_APPROVED_TEMPLATE_REQUIRED",
        message: "WhatsApp campaign broadcast requires an approved template name and language",
        correction: "Choose a provider-approved WhatsApp template before approval.",
      });
    }
    if (settings.template_unsupported_variables === true) {
      throw executionError({
        code: "WHATSAPP_TEMPLATE_VARIABLE_STRUCTURE_UNSUPPORTED",
        message: "Selected WhatsApp template uses a variable structure not certified by the current campaign adapter",
        correction: "Choose an approved body-text template without header/media variables.",
      });
    }
    const parameterCount = Number(settings.template_parameter_count || 0);
    const parameters = Array.isArray(settings.template_components?.[0]?.parameters)
      ? settings.template_components[0].parameters
      : [];
    if (parameterCount > 0 && (parameters.length !== parameterCount || parameters.some((item) => !text(item?.text)))) {
      throw executionError({
        code: "WHATSAPP_TEMPLATE_PARAMETERS_INCOMPLETE",
        message: "Every WhatsApp template body variable must have an explicit value",
        correction: "Complete all template variables before approval.",
      });
    }
  }
  if (["line", "telegram", "sms"].includes(channelId) && !message) {
    throw executionError({ code: "OWNED_MESSAGING_BODY_REQUIRED", message: `${channelId} campaign requires a message body` });
  }

  return {
    channel_id: channelId,
    sender_asset_id: senderAssetId,
    recipient_party_ids: recipientPartyIds,
    subject: subject || null,
    message: message || null,
    destination_url: text(settings.destination_url) || null,
    frequency_cap: 1,
    ...(channelId === "whatsapp" ? {
      template_name: text(settings.template_name),
      template_language: text(settings.template_language),
      template_components: Array.isArray(settings.template_components) ? settings.template_components : [],
      template_parameter_count: Number(settings.template_parameter_count || 0),
    } : {}),
  };
}

export const OWNED_MESSAGING_CHANNELS = Object.freeze([...SUPPORTED]);
export default translateOwnedMessagingCampaignPlan;
