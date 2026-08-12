import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  createConversation,
  createMessage,
  updateConversation,
  updateMessage,
} from "./CommunicationRepository";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function lower(value) {
  return text(value).toLowerCase();
}

function upper(value) {
  return text(value).toUpperCase();
}

function providerTimestamp(value) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric < 100000000000 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function oneConversation({
  organizationId,
  provider,
  connectionId,
  externalThreadId,
  participantId,
}) {
  let query = supabaseAdmin
    .from("communication_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .eq("connection_id", connectionId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (text(externalThreadId)) {
    query = query.eq("external_thread_id", text(externalThreadId));
  } else {
    query = query.eq("external_participant_id", text(participantId));
  }

  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

async function messageByExternalId({ organizationId, provider, externalMessageId }) {
  if (!text(externalMessageId)) return null;
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .eq("external_message_id", text(externalMessageId))
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function resolveCommunicationConnectionByAsset({
  provider,
  assetType,
  externalId,
}) {
  const normalizedProvider = lower(provider);
  const normalizedExternalId = text(externalId);
  if (!normalizedProvider || !text(assetType) || !normalizedExternalId) return null;

  const { data: assets, error: assetError } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,connection_id,channel_provider,asset_type,external_id,name,metadata")
    .eq("channel_provider", normalizedProvider)
    .eq("asset_type", text(assetType))
    .eq("external_id", normalizedExternalId)
    .limit(2);
  if (assetError) throw assetError;
  if (!assets?.length) return null;
  if (assets.length > 1) throw new Error("COMMUNICATION_CHANNEL_ASSET_AMBIGUOUS");

  return resolveCommunicationConnectionById({
    provider: normalizedProvider,
    connectionId: assets[0].connection_id,
    organizationId: assets[0].organization_id,
    asset: assets[0],
  });
}

export async function resolveCommunicationConnectionById({
  provider,
  connectionId,
  organizationId = null,
  asset = null,
}) {
  const normalizedProvider = lower(provider);
  const normalizedConnectionId = text(connectionId);
  if (!normalizedProvider || !normalizedConnectionId) return null;

  let query = supabaseAdmin
    .from("organization_channel_connections")
    .select("id,organization_id,provider,channel_type,credentials_reference,status,metadata")
    .eq("id", normalizedConnectionId)
    .eq("provider", normalizedProvider)
    .limit(1);
  if (text(organizationId)) query = query.eq("organization_id", text(organizationId));

  const { data, error } = await query;
  if (error) throw error;
  const connection = data?.[0] || null;
  if (!connection || upper(connection.status) !== "ACTIVE") return null;
  return { ...connection, asset: asset || null };
}

export async function ingestInboundCommunication({
  connection,
  externalMessageId,
  externalThreadId = null,
  participantId,
  participantName = null,
  participantAddress = null,
  recipientAddress = null,
  messageType = "TEXT",
  body = null,
  receivedAt = null,
  metadata = {},
}) {
  const organizationId = text(connection?.organization_id);
  const connectionId = text(connection?.id);
  const provider = lower(connection?.provider);
  const participant = text(participantId);
  const providerMessageId = text(externalMessageId);
  if (!organizationId || !connectionId || !provider || !participant || !providerMessageId) {
    throw new Error("COMMUNICATION_INBOUND_IDENTITY_REQUIRED");
  }

  const duplicate = await messageByExternalId({
    organizationId,
    provider,
    externalMessageId: providerMessageId,
  });
  if (duplicate) return { duplicate: true, message: duplicate, conversation: null };

  let conversation = await oneConversation({
    organizationId,
    provider,
    connectionId,
    externalThreadId,
    participantId: participant,
  });

  const now = providerTimestamp(receivedAt) || new Date().toISOString();
  if (!conversation) {
    conversation = await createConversation({
      organization_id: organizationId,
      connection_id: connectionId,
      provider,
      channel_type: connection.channel_type || provider,
      external_thread_id: text(externalThreadId) || null,
      external_participant_id: participant,
      external_participant_name: text(participantName) || null,
      external_participant_address: text(participantAddress) || participant,
      subject: null,
      status: "OPEN",
      unread_count: 0,
      last_message_at: now,
      last_inbound_at: now,
      metadata: {
        source: "PROVIDER_WEBHOOK",
        connection_name: object(connection.metadata).display_name || object(connection.metadata).verified_name || null,
      },
    });
  }

  let message;
  try {
    message = await createMessage({
      organization_id: organizationId,
      conversation_id: conversation.id,
      connection_id: connectionId,
      provider,
      channel_type: connection.channel_type || provider,
      direction: "INBOUND",
      message_type: upper(messageType) || "TEXT",
      external_message_id: providerMessageId,
      sender_address: text(participantAddress) || participant,
      recipient_address: text(recipientAddress) || null,
      body: body == null ? null : String(body),
      status: "RECEIVED",
      received_at: now,
      metadata: object(metadata),
    });
  } catch (error) {
    if (error?.code === "23505") {
      const existing = await messageByExternalId({
        organizationId,
        provider,
        externalMessageId: providerMessageId,
      });
      if (existing) return { duplicate: true, message: existing, conversation };
    }
    throw error;
  }

  conversation = await updateConversation({
    organizationId,
    conversationId: conversation.id,
    patch: {
      external_participant_name: text(participantName) || conversation.external_participant_name || null,
      external_participant_address: text(participantAddress) || conversation.external_participant_address || participant,
      unread_count: Number(conversation.unread_count || 0) + 1,
      last_message_at: now,
      last_inbound_at: now,
      status: "OPEN",
    },
  });

  return { duplicate: false, message, conversation };
}

const DELIVERY_RANK = {
  QUEUED: 0,
  SENDING: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
};

export async function applyCommunicationDeliveryStatus({
  connection,
  externalMessageId,
  status,
  providerTimestamp: statusTimestamp = null,
  errorCode = null,
  errorMessage = null,
  metadata = {},
}) {
  const organizationId = text(connection?.organization_id);
  const provider = lower(connection?.provider);
  const providerMessageId = text(externalMessageId);
  const normalizedStatus = upper(status);
  if (!organizationId || !provider || !providerMessageId) return { matched: false, message: null };
  if (!["SENT", "DELIVERED", "READ", "FAILED"].includes(normalizedStatus)) {
    return { matched: false, message: null };
  }

  const existing = await messageByExternalId({
    organizationId,
    provider,
    externalMessageId: providerMessageId,
  });
  if (!existing) return { matched: false, message: null };

  const currentStatus = upper(existing.status);
  if (currentStatus === "FAILED" && normalizedStatus !== "FAILED") {
    return { matched: true, ignored: true, message: existing };
  }
  if (
    normalizedStatus !== "FAILED" &&
    DELIVERY_RANK[currentStatus] != null &&
    DELIVERY_RANK[normalizedStatus] != null &&
    DELIVERY_RANK[normalizedStatus] < DELIVERY_RANK[currentStatus]
  ) {
    return { matched: true, ignored: true, message: existing };
  }

  const providerTime = providerTimestamp(statusTimestamp);
  const nextMetadata = {
    ...object(existing.metadata),
    ...object(metadata),
    provider_delivery_status: normalizedStatus,
    provider_delivery_timestamp: providerTime,
  };

  const message = await updateMessage({
    organizationId,
    messageId: existing.id,
    patch: {
      status: normalizedStatus,
      error_code: normalizedStatus === "FAILED" ? text(errorCode) || null : null,
      error_message: normalizedStatus === "FAILED" ? text(errorMessage) || null : null,
      sent_at:
        existing.sent_at ||
        (["SENT", "DELIVERED", "READ"].includes(normalizedStatus)
          ? providerTime || new Date().toISOString()
          : null),
      metadata: nextMetadata,
    },
  });

  return { matched: true, ignored: false, message };
}
