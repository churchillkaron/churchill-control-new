import {
  createAttachments,
  createConversation,
  createMessage,
  getActiveConnection,
  getConversation,
  getMessage,
  listActiveConnections,
  listAttachments,
  listConversations,
  listDeliveryExceptions,
  listLatestMessages,
  listMessages,
  queueDraftMessage,
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

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function booleanOrNull(value) {
  if (value === true || String(value).toLowerCase() === "true") return true;
  if (value === false || String(value).toLowerCase() === "false") return false;
  return null;
}

function stringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
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
  const metadata = object(connection?.metadata);
  const descriptor = communicationChannelDescriptor(connection?.provider);
  const syncSummary = object(metadata.communication_history_sync_summary);
  const syncResults = Array.isArray(syncSummary.results) ? syncSummary.results : [];
  const instagramSync = syncResults.find(
    (row) => String(row?.platform || "").trim().toLowerCase() === "instagram",
  );
  const instagramId = String(
    metadata.instagram_business_account_id ||
      metadata.instagram_business_id ||
      metadata.instagram_id ||
      "",
  ).trim();
  const remoteConversationCount = Number(instagramSync?.remoteConversationCount);

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
    instagramConnected: Boolean(instagramId),
    instagramBusinessAccountId: instagramId || null,
    instagramUsername: String(metadata.instagram_username || "").trim() || null,
    messagingReadinessCheckedAt:
      String(metadata.messaging_readiness_checked_at || "").trim() || null,
    instagramMessagingReady: booleanOrNull(metadata.instagram_messaging_ready),
    pageInstagramLinkOk: booleanOrNull(metadata.messaging_page_instagram_link_ok),
    requiredScopesMissing: stringList(metadata.messaging_required_scopes_missing),
    historySyncStatus:
      String(metadata.communication_history_sync_status || "").trim() || null,
    instagramRemoteConversationCount: Number.isFinite(remoteConversationCount)
      ? remoteConversationCount
      : null,
  };
}

function safeConnections(connection) {
  const primary = safeConnection(connection);
  if (!primary.instagramConnected) return [primary];

  const instagramDescriptor = communicationChannelDescriptor("instagram_messaging");
  return [
    primary,
    {
      ...primary,
      id: `${primary.id}:instagram`,
      provider: "instagram_messaging",
      family: instagramDescriptor.family,
      label: instagramDescriptor.label,
      channelType: "instagram",
      sendable: instagramDescriptor.sendable,
      deliveryServiceId: instagramDescriptor.serviceId,
      deliveryCapability: instagramDescriptor.capability,
      name: primary.instagramUsername ? `@${primary.instagramUsername}` : "Instagram",
      sourceConnectionId: primary.id,
    },
  ];
}

function normalizedAttachmentRows({ organizationId, messageId, attachments = [] }) {
  return (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => {
      const source = object(attachment);
      const externalUrl = String(source.external_url || source.url || "").trim() || null;
      const storagePath = String(source.storage_path || "").trim() || null;
      if (!externalUrl && !storagePath) return null;
      const size = Number(source.size_bytes ?? source.size);
      return {
        organization_id: organizationId,
        message_id: messageId,
        storage_path: storagePath,
        external_url: externalUrl,
        file_name: String(source.file_name || source.name || "").trim() || null,
        mime_type: String(source.mime_type || source.type || "").trim() || null,
        size_bytes: Number.isFinite(size) && size >= 0 ? Math.trunc(size) : null,
        metadata: object(source.metadata),
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function messageTypeFor(body, attachments = []) {
  const hasText = Boolean(String(body || "").trim());
  const files = Array.isArray(attachments) ? attachments : [];
  if (!files.length) return "TEXT";
  if (hasText) return "MIXED";
  const firstMime = String(files[0]?.mime_type || files[0]?.type || "").toLowerCase();
  if (firstMime.startsWith("image/")) return "IMAGE";
  if (firstMime.startsWith("video/")) return "VIDEO";
  if (firstMime.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

async function attachMediaToMessages({ organizationId, messages }) {
  const rows = Array.isArray(messages) ? messages : [];
  const attachments = await listAttachments({
    organizationId,
    messageIds: rows.map((row) => row.id),
  });
  const byMessage = new Map();
  for (const attachment of attachments) {
    const bucket = byMessage.get(attachment.message_id) || [];
    bucket.push(attachment);
    byMessage.set(attachment.message_id, bucket);
  }
  return rows.map((row) => ({
    ...row,
    attachments: byMessage.get(row.id) || [],
  }));
}

export async function getCommunicationInbox({ organizationId, provider = null, search = null }) {
  const conversations = await listConversations({ organizationId, provider, search });
  const latestRows = await listLatestMessages({
    organizationId,
    conversationIds: conversations.map((row) => row.id),
  });
  const latestWithAttachments = await attachMediaToMessages({ organizationId, messages: latestRows });
  const latestByConversation = new Map();
  for (const row of latestWithAttachments) {
    if (!latestByConversation.has(row.conversation_id)) latestByConversation.set(row.conversation_id, row);
  }
  const connections = await listActiveConnections({ organizationId });
  return {
    conversations: conversations.map((row) => ({
      ...decorateConversation(row),
      latestMessage: latestByConversation.get(row.id) || null,
    })),
    connections: connections.flatMap(safeConnections),
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
    messages: await attachMediaToMessages({ organizationId, messages }),
  };
}

export async function queueOutboundMessage({
  organizationId,
  conversationId,
  body,
  subject = null,
  sentByPartyId = null,
  attachments = [],
}) {
  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");
  const text = String(body || "").trim();
  const attachmentRows = Array.isArray(attachments) ? attachments : [];
  if (!text && !attachmentRows.length) throw new Error("MESSAGE_BODY_OR_ATTACHMENT_REQUIRED");
  const now = new Date().toISOString();
  const message = await createMessage({
    organization_id: organizationId,
    conversation_id: conversation.id,
    connection_id: conversation.connection_id,
    provider: conversation.provider,
    channel_type: conversation.channel_type,
    direction: "OUTBOUND",
    message_type: messageTypeFor(text, attachmentRows),
    recipient_address: conversation.external_participant_address || conversation.external_participant_id,
    subject: String(subject || conversation.subject || "").trim() || null,
    body: text || null,
    status: "QUEUED",
    sent_by_party_id: sentByPartyId || null,
    metadata: {},
  });
  const savedAttachments = await createAttachments(
    normalizedAttachmentRows({ organizationId, messageId: message.id, attachments: attachmentRows }),
  );
  await updateConversation({
    organizationId,
    conversationId,
    patch: { last_message_at: now, last_outbound_at: now, subject: message.subject || conversation.subject },
  });
  return { ...message, attachments: savedAttachments };
}

export async function draftOutboundMessage({
  organizationId,
  conversationId,
  body,
  subject = null,
  sentByPartyId = null,
}) {
  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");
  if (String(conversation.status || "").toUpperCase() !== "OPEN") {
    throw new Error("CONVERSATION_NOT_OPEN");
  }

  const text = String(body || "").trim();
  if (!text) throw new Error("MESSAGE_BODY_REQUIRED");

  return createMessage({
    organization_id: organizationId,
    conversation_id: conversation.id,
    connection_id: conversation.connection_id,
    provider: conversation.provider,
    channel_type: conversation.channel_type,
    direction: "OUTBOUND",
    message_type: "TEXT",
    recipient_address:
      conversation.external_participant_address ||
      conversation.external_participant_id,
    subject: String(subject || conversation.subject || "").trim() || null,
    body: text,
    status: "DRAFT",
    sent_by_party_id: sentByPartyId || null,
    metadata: {
      source: "AVANTIQO_OPERATOR",
      delivery_authorized: false,
    },
  });
}

export async function queueDraftOutboundMessage({
  organizationId,
  conversationId,
  messageId,
}) {
  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");
  if (String(conversation.status || "").toUpperCase() !== "OPEN") {
    throw new Error("CONVERSATION_NOT_OPEN");
  }

  const draft = await getMessage({
    organizationId,
    conversationId,
    messageId,
  });
  if (!draft) throw new Error("COMMUNICATION_DRAFT_NOT_FOUND");
  if (draft.direction !== "OUTBOUND" || draft.status !== "DRAFT") {
    throw new Error("COMMUNICATION_MESSAGE_NOT_SENDABLE_DRAFT");
  }

  const queued = await queueDraftMessage({
    organizationId,
    conversationId,
    messageId,
  });
  if (!queued) throw new Error("COMMUNICATION_DRAFT_STATE_CHANGED");

  const now = new Date().toISOString();
  await updateConversation({
    organizationId,
    conversationId,
    patch: {
      last_message_at: now,
      last_outbound_at: now,
      subject: queued.subject || conversation.subject,
    },
  });

  return queued;
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

export async function getCommunicationDeliveryHealth({
  organizationId,
  windowHours = 24,
  stuckMinutes = 15,
} = {}) {
  if (!organizationId) throw new Error("COMMUNICATION_ORGANIZATION_REQUIRED");

  const now = Date.now();
  const windowMs = Math.max(Number(windowHours) || 24, 1) * 60 * 60 * 1000;
  const stuckMs = Math.max(Number(stuckMinutes) || 15, 1) * 60 * 1000;
  const rows = await listDeliveryExceptions({
    organizationId,
    since: new Date(now - windowMs).toISOString(),
  });
  const failed = rows.filter((row) => row.status === "FAILED");
  const stuck = rows.filter(
    (row) =>
      ["QUEUED", "SENDING"].includes(row.status) &&
      now - new Date(row.updated_at || row.created_at).getTime() > stuckMs,
  );
  const pending = rows.filter(
    (row) =>
      ["QUEUED", "SENDING"].includes(row.status) &&
      !stuck.some((candidate) => candidate.id === row.id),
  );

  return {
    status: failed.length || stuck.length ? "degraded" : "healthy",
    window_hours: Math.max(Number(windowHours) || 24, 1),
    failed_count: failed.length,
    stuck_count: stuck.length,
    pending_count: pending.length,
    exceptions: [...failed, ...stuck].slice(0, 20).map((row) => ({
      message_id: row.id,
      conversation_id: row.conversation_id,
      provider: row.provider,
      channel_type: row.channel_type,
      status: row.status,
      error_code: row.error_code || null,
      error_message: String(row.error_message || "").slice(0, 300) || null,
      updated_at: row.updated_at,
    })),
  };
}
