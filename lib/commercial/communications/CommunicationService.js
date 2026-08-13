import {
  createConversation,
  createMessage,
  getActiveConnection,
  getConversation,
  listActiveConnections,
  listConversations,
  listLatestMessages,
  listMessages,
  updateConversation,
  updateMessage,
} from "./CommunicationRepository";
import { communicationChannelDescriptor } from "./CommunicationChannelCatalog";

export function communicationChannelLabel(provider) {
  return communicationChannelDescriptor(provider).label;
}

export function communicationFamily(provider) {
  return communicationChannelDescriptor(provider).family;
}

function decorateConversation(row) {
  const descriptor = communicationChannelDescriptor(row?.provider);
  return {
    ...row,
    family: descriptor.family,
    channelLabel: descriptor.label,
    sendable: descriptor.sendable,
    deliveryServiceId: descriptor.serviceId,
    deliveryCapability: descriptor.capability,
  };
}

function safeConnection(connection) {
  const metadata = connection?.metadata && typeof connection.metadata === "object" ? connection.metadata : {};
  const descriptor = communicationChannelDescriptor(connection?.provider);
  return {
    id: connection.id,
    provider: connection.provider,
    family: descriptor.family,
    label: descriptor.label,
    channelType: connection.channel_type,
    sendable: descriptor.sendable,
    deliveryServiceId: descriptor.serviceId,
    deliveryCapability: descriptor.capability,
    name:
      connection.name ||
      metadata.account_name ||
      metadata.page_name ||
      metadata.email ||
      metadata.basic_id ||
      descriptor.label,
  };
}

export async function getCommunicationInbox({ organizationId, provider = null, search = null }) {
  const conversations = await listConversations({ organizationId, provider, search });
  const latestRows = await listLatestMessages({
    organizationId,
    conversationIds: conversations.map((row) => row.id),
  });
  const latestByConversation = new Map();
  for (const row of latestRows) {
    if (!latestByConversation.has(row.conversation_id)) latestByConversation.set(row.conversation_id, row);
  }
  const connections = await listActiveConnections({ organizationId });
  return {
    conversations: conversations.map((row) => ({
      ...decorateConversation(row),
      latestMessage: latestByConversation.get(row.id) || null,
    })),
    connections: connections.map(safeConnection),
  };
}

export async function openConversation({ organizationId, connectionId, recipientAddress, recipientName = null, subject = null, customerPartyId = null }) {
  const connection = await getActiveConnection({ organizationId, connectionId });
  if (!connection) throw new Error("ACTIVE_BUSINESS_CONNECTION_REQUIRED");
  const recipient = String(recipientAddress || "").trim();
  if (!recipient) throw new Error("RECIPIENT_REQUIRED");
  const descriptor = communicationChannelDescriptor(connection.provider);
  return createConversation({
    organization_id: organizationId,
    connection_id: connection.id,
    provider: connection.provider,
    channel_type: connection.channel_type || descriptor.family,
    external_participant_id: recipient,
    external_participant_name: String(recipientName || "").trim() || null,
    external_participant_address: recipient,
    customer_party_id: customerPartyId || null,
    subject: String(subject || "").trim() || null,
    status: "OPEN",
    unread_count: 0,
    metadata: { connection_name: safeConnection(connection).name },
  });
}

export async function getConversationTimeline({ organizationId, conversationId, markRead = false }) {
  let conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");
  if (markRead && Number(conversation.unread_count || 0) > 0) {
    conversation = await updateConversation({ organizationId, conversationId, patch: { unread_count: 0 } });
  }
  const messages = await listMessages({ organizationId, conversationId });
  return {
    conversation: decorateConversation(conversation),
    messages,
  };
}

export async function queueOutboundMessage({ organizationId, conversationId, body, subject = null, sentByPartyId = null }) {
  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");
  const text = String(body || "").trim();
  if (!text) throw new Error("MESSAGE_BODY_REQUIRED");
  const now = new Date().toISOString();
  const message = await createMessage({
    organization_id: organizationId,
    conversation_id: conversation.id,
    connection_id: conversation.connection_id,
    provider: conversation.provider,
    channel_type: conversation.channel_type,
    direction: "OUTBOUND",
    message_type: "TEXT",
    recipient_address: conversation.external_participant_address || conversation.external_participant_id,
    subject: String(subject || conversation.subject || "").trim() || null,
    body: text,
    status: "QUEUED",
    sent_by_party_id: sentByPartyId || null,
    metadata: {},
  });
  await updateConversation({
    organizationId,
    conversationId,
    patch: { last_message_at: now, last_outbound_at: now, subject: message.subject || conversation.subject },
  });
  return message;
}

export async function setMessageDeliveryState({
  organizationId,
  messageId,
  status,
  errorCode = null,
  errorMessage = null,
  metadata = {},
  externalMessageId = undefined,
}) {
  const now = new Date().toISOString();
  const patch = {
    status,
    error_code: errorCode,
    error_message: errorMessage,
    sent_at: ["SENT", "DELIVERED", "READ"].includes(status) ? now : null,
    metadata,
  };
  if (externalMessageId !== undefined) {
    patch.external_message_id = externalMessageId || null;
  }

  return updateMessage({
    organizationId,
    messageId,
    patch,
  });
}

export async function setConversationStatus({ organizationId, conversationId, status }) {
  const normalized = String(status || "").toUpperCase();
  if (!["OPEN", "ARCHIVED", "CLOSED"].includes(normalized)) throw new Error("CONVERSATION_STATUS_INVALID");
  return updateConversation({ organizationId, conversationId, patch: { status: normalized } });
}
