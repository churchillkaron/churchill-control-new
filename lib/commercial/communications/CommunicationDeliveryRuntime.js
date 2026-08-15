import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { communicationChannelDescriptor } from "./CommunicationChannelCatalog";
import {
  getConversationTimeline,
  setMessageDeliveryState,
} from "./CommunicationService";

function safeFailureMessage() {
  return "Delivery is not ready for this channel yet. Your message was kept in Communications.";
}

export async function deliverCommunicationMessage({
  organizationId,
  conversationId,
  message,
  partyId = null,
}) {
  const timeline = await getConversationTimeline({
    organizationId,
    conversationId,
  });
  const conversation = timeline.conversation;
  const delivery = communicationChannelDescriptor(conversation.provider);
  const persistedMessage = (timeline.messages || []).find((row) => row.id === message.id) || message;
  const attachments = Array.isArray(persistedMessage.attachments)
    ? persistedMessage.attachments
    : Array.isArray(message.attachments)
      ? message.attachments
      : [];

  if (!delivery.sendable || !delivery.serviceId || !delivery.capability) {
    return setMessageDeliveryState({
      organizationId,
      messageId: message.id,
      status: "QUEUED",
      errorCode: null,
      errorMessage: null,
      metadata: {
        delivery_state: "API_ADAPTER_PENDING",
        channel_family: delivery.family,
      },
    });
  }

  await setMessageDeliveryState({
    organizationId,
    messageId: message.id,
    status: "SENDING",
    metadata: {
      delivery_state: "EXECUTING",
      channel_family: delivery.family,
      attachment_count: attachments.length,
    },
  });

  try {
    const recipient =
      conversation.external_participant_address ||
      conversation.external_participant_id;
    const media = attachments.map((attachment) => ({
      url: attachment.external_url || null,
      storage_path: attachment.storage_path || null,
      name: attachment.file_name || null,
      mime_type: attachment.mime_type || null,
      size_bytes: attachment.size_bytes || null,
      metadata: attachment.metadata || {},
    }));
    const payload = delivery.family === "line"
      ? {
          user_id: recipient,
          message: persistedMessage.body,
          attachments: media,
          retry_key: message.id,
          quantity: 1,
        }
      : {
          recipient,
          message: persistedMessage.body,
          attachments: media,
          quantity: 1,
        };

    const result = await executeService({
      organization_id: organizationId,
      party_id: partyId || null,
      service_id: delivery.serviceId,
      capability: delivery.capability,
      input: payload,
      metadata: {
        communication_message_id: message.id,
        conversation_id: conversation.id,
        source: "AVANTIQO_COMMUNICATIONS",
        attachment_count: media.length,
      },
    });

    const providerOutput = result?.output?.output || result?.output || {};
    const externalMessageId =
      providerOutput?.messages?.[0]?.id ||
      providerOutput?.sentMessages?.[0]?.message_id ||
      providerOutput?.sentMessages?.[0]?.id ||
      providerOutput?.message_id ||
      providerOutput?.id ||
      null;

    return setMessageDeliveryState({
      organizationId,
      messageId: message.id,
      status: "SENT",
      externalMessageId,
      metadata: {
        delivery_state: "SENT",
        channel_family: delivery.family,
        usage_id: result?.usage?.id || null,
        external_message_id: externalMessageId,
        provider_message_ids: Array.isArray(providerOutput?.sentMessages)
          ? providerOutput.sentMessages.map((row) => row?.message_id || row?.id).filter(Boolean)
          : [],
        attachment_count: media.length,
      },
    });
  } catch {
    return setMessageDeliveryState({
      organizationId,
      messageId: message.id,
      status: "FAILED",
      errorCode: "CHANNEL_DELIVERY_NOT_READY",
      errorMessage: safeFailureMessage(),
      metadata: {
        delivery_state: "NOT_READY",
        channel_family: delivery.family,
        attachment_count: attachments.length,
      },
    });
  }
}
