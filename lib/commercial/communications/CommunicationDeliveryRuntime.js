import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
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
    },
  });

  try {
    const recipient =
      conversation.external_participant_address ||
      conversation.external_participant_id;
    const payload = delivery.family === "line"
      ? {
          user_id: recipient,
          message: message.body,
          retry_key: message.id,
          quantity: 1,
        }
      : { recipient, message: message.body, quantity: 1 };

    const wallet = await WalletRepository.getByOrganization(organizationId);
    const currency = wallet?.currency || wallet?.default_currency || null;
    if (!currency) {
      throw new Error("ORGANIZATION_WALLET_CURRENCY_REQUIRED");
    }

    const result = await executeService({
      organization_id: organizationId,
      party_id: partyId || null,
      service_id: delivery.serviceId,
      capability: delivery.capability,
      currency,
      input: {
        ...payload,
        currency,
      },
      metadata: {
        communication_message_id: message.id,
        conversation_id: conversation.id,
        source: "AVANTIQO_COMMUNICATIONS",
      },
    });

    const providerOutput = result?.output?.output || result?.output || {};
    const externalMessageId =
      providerOutput?.messages?.[0]?.id ||
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
      },
    });
  }
}
