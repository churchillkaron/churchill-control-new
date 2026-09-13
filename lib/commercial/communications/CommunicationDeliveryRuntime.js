import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import { renderCustomerInvoicePdf } from "@/lib/finance/accounts-receivable/documents/renderCustomerInvoicePdf";
import { communicationChannelDescriptor } from "./CommunicationChannelCatalog";
import {
  getConversationTimeline,
  setMessageDeliveryState,
} from "./CommunicationService";

function safeFailureMessage() {
  return "Delivery is not ready for this channel yet. Your message was kept in Communications.";
}

function canonicalFinancePdf(reference, organizationId) {
  const raw = String(reference || "").trim();
  if (!raw.startsWith("/api/finance/customer-invoices/")) return null;
  const parsed = new URL(raw, "https://avantiqo.local");
  const match = parsed.pathname.match(/^\/api\/finance\/customer-invoices\/([^/]+)\/pdf$/);
  if (!match) return null;
  const scopedOrganizationId = parsed.searchParams.get("organizationId") || parsed.searchParams.get("organization_id");
  if (!scopedOrganizationId || scopedOrganizationId !== organizationId) {
    throw new Error("COMMUNICATION_FINANCE_DOCUMENT_SCOPE_MISMATCH");
  }
  return {
    invoiceId: decodeURIComponent(match[1]),
    entityId: parsed.searchParams.get("entityId") || parsed.searchParams.get("entity_id") || null,
    mode: parsed.searchParams.get("mode") || "auto",
  };
}

async function outboundMediaAttachment({ attachment, organizationId }) {
  const url = attachment.external_url || null;
  const media = {
    url,
    storage_path: attachment.storage_path || null,
    name: attachment.file_name || null,
    mime_type: attachment.mime_type || null,
    size_bytes: attachment.size_bytes || null,
    metadata: attachment.metadata || {},
  };
  const financePdf = canonicalFinancePdf(url, organizationId);
  if (!financePdf) return media;

  const rendered = await renderCustomerInvoicePdf({
    organizationId,
    entityId: financePdf.entityId,
    invoiceId: financePdf.invoiceId,
    mode: financePdf.mode,
  });
  return {
    ...media,
    url: null,
    name: media.name || rendered.filename,
    mime_type: "application/pdf",
    size_bytes: rendered.buffer.length,
    data_base64: rendered.buffer.toString("base64"),
    metadata: {
      ...media.metadata,
      source: "CANONICAL_FINANCE_PDF",
      invoice_id: financePdf.invoiceId,
      entity_id: financePdf.entityId,
      mode: financePdf.mode,
    },
  };
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
  const messageSource = String(persistedMessage?.metadata?.source || message?.metadata?.source || "")
    .trim()
    .toUpperCase();
  const executionPartyId = messageSource === "AVANTIQO_SECRETARY" ? null : partyId || null;

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
    const media = await Promise.all(
      attachments.map((attachment) => outboundMediaAttachment({ attachment, organizationId })),
    );
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
          subject: persistedMessage.subject || conversation.subject || null,
          message: persistedMessage.body,
          attachments: media,
          quantity: 1,
        };

    const wallet = await WalletRepository.getByOrganization(organizationId);
    const currency = wallet?.currency || wallet?.default_currency || null;
    if (!currency) {
      throw new Error("ORGANIZATION_WALLET_CURRENCY_REQUIRED");
    }

    const result = await executeService({
      organization_id: organizationId,
      party_id: executionPartyId,
      service_id: delivery.serviceId,
      provider_id: conversation.provider,
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
        execution_actor: messageSource === "AVANTIQO_SECRETARY" ? "AVANTIQO_SECRETARY" : "REQUEST_PARTY",
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
