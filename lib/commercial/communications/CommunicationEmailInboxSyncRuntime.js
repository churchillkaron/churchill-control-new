import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import {
  ingestInboundCommunication,
} from "./CommunicationWebhookRuntime";
import {
  updateConversation,
  updateMessage,
} from "./CommunicationRepository";

const EMAIL_PROVIDERS = new Set([
  "email_google",
  "email_microsoft",
  "email_imap",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function due(connection, intervalMinutes) {
  const sync = object(object(connection?.metadata).email_sync);
  const last = Date.parse(sync.last_attempt_at || sync.last_success_at || "");
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= intervalMinutes * 60 * 1000;
}

async function persistConnectionSync({ connection, patch }) {
  const metadata = object(connection.metadata);
  return ChannelConnectionRuntime.connect({
    organization_id: connection.organization_id,
    provider: connection.provider,
    channel_type: connection.channel_type || "email",
    credentials_reference: connection.credentials_reference || null,
    metadata: {
      ...metadata,
      email_sync: {
        ...object(metadata.email_sync),
        ...patch,
      },
    },
  });
}

async function ingestMessage({ connection, message }) {
  const ingested = await ingestInboundCommunication({
    connection,
    providerOverride: connection.provider,
    channelTypeOverride: "email",
    conversationMetadata: {
      source: "EMAIL_INBOX_SYNC",
      mailbox: text(object(connection.metadata).email) || null,
      provider_thread_id: text(message.external_thread_id) || null,
    },
    externalMessageId: message.external_message_id,
    externalThreadId: message.external_thread_id,
    participantId: message.participant_id,
    participantName: message.participant_name,
    participantAddress: message.participant_address,
    recipientAddress: message.recipient_address,
    messageType: "EMAIL",
    body: message.body,
    receivedAt: message.received_at,
    metadata: {
      ...object(message.metadata),
      subject: text(message.subject) || null,
      sync_source: "EMAIL_INBOX_SYNC",
    },
  });

  if (ingested.duplicate) return ingested;

  const subject = text(message.subject) || null;
  if (subject && ingested.message?.id) {
    ingested.message = await updateMessage({
      organizationId: connection.organization_id,
      messageId: ingested.message.id,
      patch: { subject },
    });
  }
  if (subject && ingested.conversation?.id) {
    ingested.conversation = await updateConversation({
      organizationId: connection.organization_id,
      conversationId: ingested.conversation.id,
      patch: {
        subject: ingested.conversation.subject || subject,
      },
    });
  }

  return ingested;
}

export async function syncEmailConnection({ connection }) {
  if (!connection?.organization_id || !EMAIL_PROVIDERS.has(connection.provider)) {
    throw new Error("EMAIL_CONNECTION_REQUIRED");
  }
  if (String(connection.status || "").toUpperCase() !== "ACTIVE") {
    return { success: true, skipped: true, reason: "CONNECTION_NOT_ACTIVE" };
  }

  const organizationId = connection.organization_id;
  const wallet = await WalletRepository.getByOrganization(organizationId);
  const currency = wallet?.currency || wallet?.default_currency || null;
  if (!currency) throw new Error("ORGANIZATION_WALLET_CURRENCY_REQUIRED");

  const metadata = object(connection.metadata);
  const syncState = object(metadata.email_sync);
  const attemptedAt = new Date().toISOString();
  await persistConnectionSync({
    connection,
    patch: {
      last_attempt_at: attemptedAt,
      status: "SYNCING",
      last_error: null,
    },
  });

  try {
    const result = await executeService({
      organization_id: organizationId,
      service_id: "email",
      provider_id: connection.provider,
      capability: "communication.email.sync",
      currency,
      input: {
        currency,
        cursor: object(syncState.cursor),
        quantity: 1,
      },
      metadata: {
        source: "AVANTIQO_COMMUNICATIONS_EMAIL_SYNC",
        connection_id: connection.id,
        mailbox: text(metadata.email) || null,
      },
    });

    const providerEnvelope = object(result?.output);
    const providerOutput = object(providerEnvelope.output);
    const messages = Array.isArray(providerOutput.messages)
      ? providerOutput.messages
      : [];

    let created = 0;
    let duplicates = 0;
    for (const message of messages) {
      const saved = await ingestMessage({ connection, message: object(message) });
      if (saved?.duplicate) duplicates += 1;
      else created += 1;
    }

    const completedAt = new Date().toISOString();
    await persistConnectionSync({
      connection,
      patch: {
        status: "READY",
        cursor: object(providerOutput.cursor),
        last_attempt_at: attemptedAt,
        last_success_at: completedAt,
        last_error: null,
        last_received_count: messages.length,
        last_created_count: created,
        last_duplicate_count: duplicates,
        reset_on_last_sync: providerOutput.reset === true,
        usage_id: result?.usage?.id || null,
      },
    });

    return {
      success: true,
      provider: connection.provider,
      organization_id: organizationId,
      connection_id: connection.id,
      received: messages.length,
      created,
      duplicates,
      reset: providerOutput.reset === true,
      usage_id: result?.usage?.id || null,
    };
  } catch (error) {
    await persistConnectionSync({
      connection,
      patch: {
        status: "ERROR",
        last_attempt_at: attemptedAt,
        last_error: error?.message || "EMAIL_SYNC_FAILED",
      },
    }).catch(() => null);
    throw error;
  }
}

export async function syncDueEmailConnections({
  organizationLimit = 5,
  connectionLimit = 10,
  intervalMinutes = 5,
} = {}) {
  const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
  const { data, error } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("*")
    .eq("channel_type", "email")
    .eq("status", "ACTIVE")
    .in("provider", [...EMAIL_PROVIDERS])
    .order("updated_at", { ascending: true })
    .limit(Math.max(connectionLimit * 3, 20));
  if (error) throw error;

  const seenOrganizations = new Set();
  const selected = [];
  for (const connection of data || []) {
    if (!due(connection, intervalMinutes)) continue;
    if (
      !seenOrganizations.has(connection.organization_id) &&
      seenOrganizations.size >= organizationLimit
    ) {
      continue;
    }
    seenOrganizations.add(connection.organization_id);
    selected.push(connection);
    if (selected.length >= connectionLimit) break;
  }

  const results = [];
  for (const connection of selected) {
    try {
      results.push(await syncEmailConnection({ connection }));
    } catch (error) {
      results.push({
        success: false,
        provider: connection.provider,
        organization_id: connection.organization_id,
        connection_id: connection.id,
        error: error?.message || "EMAIL_SYNC_FAILED",
      });
    }
  }

  return {
    success: results.every((row) => row.success !== false),
    checked: selected.length,
    results,
  };
}
