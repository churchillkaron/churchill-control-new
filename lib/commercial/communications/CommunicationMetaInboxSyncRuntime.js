import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { readMetaMessagingInbox } from "@/lib/platform/service-runtime/providers/meta/MetaMessagingInboxRuntime";
import {
  createConversation,
  createMessage,
  listActiveConnections,
  updateConversation,
} from "./CommunicationRepository";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rows(value) {
  return Array.isArray(value?.data) ? value.data : Array.isArray(value) ? value : [];
}

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getFullConnection({ organizationId, connectionId }) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("id,organization_id,provider,channel_type,credentials_reference,status,metadata")
    .eq("organization_id", organizationId)
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function conversationByThread({ organizationId, provider, connectionId, externalThreadId }) {
  const { data, error } = await supabaseAdmin
    .from("communication_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .eq("connection_id", connectionId)
    .eq("external_thread_id", externalThreadId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function messageExists({ organizationId, provider, externalMessageId }) {
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .eq("external_message_id", externalMessageId)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

function participantForConversation(conversation, ownIds) {
  return rows(conversation?.participants).find((participant) => {
    const id = text(participant?.id);
    return id && !ownIds.has(id);
  }) || rows(conversation?.participants)[0] || null;
}

function messageRecipients(message) {
  return rows(message?.to);
}

async function syncPlatform({
  organizationId,
  connection,
  credential,
  provider,
  platform,
  accountId,
  ownIds,
}) {
  if (!accountId) {
    return { provider, platform, skipped: true, conversationCount: 0, messageCount: 0 };
  }

  const result = await readMetaMessagingInbox({
    access_token: credential.secret_reference,
    account_id: accountId,
    platform,
    provider,
    conversation_limit: 100,
    message_limit: 250,
  });

  let conversationCount = 0;
  let messageCount = 0;

  for (const remoteConversation of result.conversations || []) {
    const threadId = text(remoteConversation?.id);
    if (!threadId) continue;

    const participant = participantForConversation(remoteConversation, ownIds);
    const participantId = text(participant?.id);
    if (!participantId) continue;

    const messages = Array.isArray(remoteConversation?.messages)
      ? [...remoteConversation.messages].sort((left, right) => {
          return new Date(left?.created_time || 0) - new Date(right?.created_time || 0);
        })
      : [];

    const lastMessage = messages[messages.length - 1] || null;
    const lastMessageAt =
      iso(lastMessage?.created_time) ||
      iso(remoteConversation?.updated_time) ||
      new Date().toISOString();

    let conversation = await conversationByThread({
      organizationId,
      provider,
      connectionId: connection.id,
      externalThreadId: threadId,
    });

    if (!conversation) {
      conversation = await createConversation({
        organization_id: organizationId,
        connection_id: connection.id,
        provider,
        channel_type: platform,
        external_thread_id: threadId,
        external_participant_id: participantId,
        external_participant_name: text(participant?.name) || null,
        external_participant_address: participantId,
        subject: null,
        status: "OPEN",
        unread_count: 0,
        last_message_at: lastMessageAt,
        last_inbound_at: null,
        last_outbound_at: null,
        metadata: {
          source: "PROVIDER_HISTORY_SYNC",
          connection_provider: "meta",
          meta_account_id: accountId,
          meta_platform: platform,
        },
      });
      conversationCount += 1;
    }

    let lastInboundAt = conversation.last_inbound_at || null;
    let lastOutboundAt = conversation.last_outbound_at || null;

    for (const remoteMessage of messages) {
      const externalMessageId = text(remoteMessage?.id);
      if (!externalMessageId) continue;
      if (await messageExists({ organizationId, provider, externalMessageId })) continue;

      const senderId = text(remoteMessage?.from?.id);
      const outgoing = ownIds.has(senderId);
      const createdAt = iso(remoteMessage?.created_time) || new Date().toISOString();
      const recipients = messageRecipients(remoteMessage);
      const recipientId = text(recipients[0]?.id) || null;

      try {
        await createMessage({
          organization_id: organizationId,
          conversation_id: conversation.id,
          connection_id: connection.id,
          provider,
          channel_type: platform,
          direction: outgoing ? "OUTBOUND" : "INBOUND",
          message_type: "TEXT",
          external_message_id: externalMessageId,
          sender_address: senderId || null,
          recipient_address: recipientId,
          subject: null,
          body: remoteMessage?.message == null ? null : String(remoteMessage.message),
          status: outgoing ? "SENT" : "RECEIVED",
          sent_at: outgoing ? createdAt : null,
          received_at: outgoing ? null : createdAt,
          metadata: {
            source: "PROVIDER_HISTORY_SYNC",
            meta_platform: platform,
          },
        });
        messageCount += 1;
        if (outgoing) lastOutboundAt = createdAt;
        else lastInboundAt = createdAt;
      } catch (error) {
        if (error?.code !== "23505") throw error;
      }
    }

    conversation = await updateConversation({
      organizationId,
      conversationId: conversation.id,
      patch: {
        external_participant_id: participantId,
        external_participant_name: text(participant?.name) || conversation.external_participant_name || null,
        external_participant_address: participantId,
        last_message_at: lastMessageAt,
        last_inbound_at: lastInboundAt,
        last_outbound_at: lastOutboundAt,
        status: "OPEN",
        metadata: {
          ...object(conversation.metadata),
          source: "PROVIDER_HISTORY_SYNC",
          connection_provider: "meta",
          meta_account_id: accountId,
          meta_platform: platform,
          last_history_sync_at: new Date().toISOString(),
        },
      },
    });
  }

  return {
    provider,
    platform,
    skipped: false,
    conversationCount,
    messageCount,
    remoteConversationCount: Number(result.conversation_count || 0),
  };
}

export async function syncMetaCommunicationHistory({ organizationId }) {
  const connections = await listActiveConnections({ organizationId });
  const compactMeta = connections.find((row) => text(row.provider).toLowerCase() === "meta");
  if (!compactMeta) {
    return { success: true, connected: false, results: [] };
  }

  const connection = await getFullConnection({
    organizationId,
    connectionId: compactMeta.id,
  });
  if (!connection || text(connection.status).toUpperCase() !== "ACTIVE") {
    return { success: true, connected: false, results: [] };
  }

  const credentialId = text(connection.credentials_reference);
  if (!credentialId) throw new Error("META_COMMUNICATION_CREDENTIAL_REQUIRED");
  const credential = await CredentialRuntime.resolve(credentialId);
  if (!credential?.secret_reference) throw new Error("META_COMMUNICATION_CREDENTIAL_UNAVAILABLE");

  const metadata = object(connection.metadata);
  const pageId = text(metadata.page_id);
  const instagramBusinessId = text(metadata.instagram_business_id);
  const ownIds = new Set([pageId, instagramBusinessId].filter(Boolean));

  const results = [];
  if (pageId) {
    results.push(await syncPlatform({
      organizationId,
      connection,
      credential,
      provider: "facebook_messenger",
      platform: "messenger",
      accountId: pageId,
      ownIds,
    }));
  }
  if (instagramBusinessId) {
    results.push(await syncPlatform({
      organizationId,
      connection,
      credential,
      provider: "instagram_messaging",
      platform: "instagram",
      accountId: pageId || instagramBusinessId,
      ownIds,
    }));
  }

  return {
    success: true,
    connected: true,
    pageId: pageId || null,
    instagramBusinessId: instagramBusinessId || null,
    results,
  };
}
