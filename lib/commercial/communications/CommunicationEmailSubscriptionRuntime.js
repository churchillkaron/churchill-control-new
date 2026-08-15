import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";

const PUSH_PROVIDERS = new Set(["email_google", "email_microsoft"]);
const RENEW_BEFORE_MS = 48 * 60 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function expirationMs(value) {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 100000000000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function subscriptionDue(connection) {
  const push = object(object(connection?.metadata).email_push);
  if (text(connection?.provider) === "email_google" && !text(process.env.GOOGLE_EMAIL_PUBSUB_TOPIC)) {
    return false;
  }
  if (!text(push.mode) || !text(push.expiration)) return true;
  return expirationMs(push.expiration) - Date.now() <= RENEW_BEFORE_MS;
}

async function persistPushState({ connection, patch }) {
  const metadata = object(connection.metadata);
  return ChannelConnectionRuntime.connect({
    organization_id: connection.organization_id,
    provider: connection.provider,
    channel_type: connection.channel_type || "email",
    credentials_reference: connection.credentials_reference || null,
    metadata: {
      ...metadata,
      email_push: {
        ...object(metadata.email_push),
        ...patch,
      },
    },
  });
}

export async function ensureEmailConnectionSubscription({ connection }) {
  if (!connection?.organization_id || !PUSH_PROVIDERS.has(connection.provider)) {
    throw new Error("EMAIL_PUSH_CONNECTION_REQUIRED");
  }
  if (String(connection.status || "").toUpperCase() !== "ACTIVE") {
    return { success: true, skipped: true, reason: "CONNECTION_NOT_ACTIVE" };
  }
  if (connection.provider === "email_google" && !text(process.env.GOOGLE_EMAIL_PUBSUB_TOPIC)) {
    return { success: true, skipped: true, reason: "GOOGLE_EMAIL_PUSH_NOT_CONFIGURED" };
  }

  const wallet = await WalletRepository.getByOrganization(connection.organization_id);
  const currency = wallet?.currency || wallet?.default_currency || null;
  if (!currency) throw new Error("ORGANIZATION_WALLET_CURRENCY_REQUIRED");

  const metadata = object(connection.metadata);
  const push = object(metadata.email_push);
  const clientState = connection.provider === "email_microsoft"
    ? crypto.randomBytes(32).toString("hex")
    : null;
  const attemptedAt = new Date().toISOString();

  try {
    const result = await executeService({
      organization_id: connection.organization_id,
      service_id: "email",
      provider_id: connection.provider,
      capability: "communication.email.subscribe",
      currency,
      input: {
        currency,
        quantity: 1,
        subscription_id: text(push.subscription_id) || null,
        client_state: clientState,
      },
      metadata: {
        source: "AVANTIQO_EMAIL_PUSH_MAINTENANCE",
        connection_id: connection.id,
      },
    });

    const envelope = object(result?.output);
    const output = object(envelope.output);
    const nextPush = {
      status: "ACTIVE",
      mode: text(output.mode) || null,
      expiration: text(output.expiration) || null,
      last_attempt_at: attemptedAt,
      last_success_at: new Date().toISOString(),
      last_error: null,
      usage_id: result?.usage?.id || null,
      ...(connection.provider === "email_google"
        ? {
            history_id: text(output.history_id) || null,
          }
        : {
            subscription_id: text(output.subscription_id) || null,
            resource: text(output.resource) || null,
            client_state_hash: hash(clientState),
          }),
    };

    await persistPushState({ connection, patch: nextPush });
    return {
      success: true,
      provider: connection.provider,
      organization_id: connection.organization_id,
      connection_id: connection.id,
      mode: nextPush.mode,
      expiration: nextPush.expiration,
      usage_id: nextPush.usage_id,
    };
  } catch (error) {
    await persistPushState({
      connection,
      patch: {
        status: "ERROR",
        last_attempt_at: attemptedAt,
        last_error: error?.message || "EMAIL_PUSH_SUBSCRIPTION_FAILED",
      },
    }).catch(() => null);
    throw error;
  }
}

export async function maintainEmailSubscriptions({ limit = 10 } = {}) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("*")
    .eq("channel_type", "email")
    .eq("status", "ACTIVE")
    .in("provider", [...PUSH_PROVIDERS])
    .order("updated_at", { ascending: true })
    .limit(Math.max(Number(limit) * 5, 30));
  if (error) throw error;

  const selected = (data || []).filter(subscriptionDue).slice(0, Math.max(Number(limit) || 10, 1));
  const results = [];
  for (const connection of selected) {
    try {
      results.push(await ensureEmailConnectionSubscription({ connection }));
    } catch (error) {
      results.push({
        success: false,
        provider: connection.provider,
        organization_id: connection.organization_id,
        connection_id: connection.id,
        error: error?.message || "EMAIL_PUSH_SUBSCRIPTION_FAILED",
      });
    }
  }
  return {
    success: results.every((row) => row.success !== false),
    checked: selected.length,
    results,
  };
}

export async function requestEmailSync({ provider, connectionId = null, mailbox = null, subscriptionId = null, clientState = null }) {
  let query = supabaseAdmin
    .from("organization_channel_connections")
    .select("*")
    .eq("channel_type", "email")
    .eq("status", "ACTIVE")
    .eq("provider", provider);

  if (text(connectionId)) query = query.eq("id", text(connectionId));
  const { data, error } = await query.limit(20);
  if (error) throw error;

  let candidates = data || [];
  if (provider === "email_google") {
    const normalizedMailbox = text(mailbox).toLowerCase();
    candidates = candidates.filter((row) => text(object(row.metadata).email).toLowerCase() === normalizedMailbox);
  }
  if (provider === "email_microsoft") {
    candidates = candidates.filter((row) => {
      const push = object(object(row.metadata).email_push);
      return text(push.subscription_id) === text(subscriptionId) &&
        text(push.client_state_hash) === hash(clientState);
    });
  }

  if (candidates.length !== 1) {
    return { matched: false, count: candidates.length };
  }

  const connection = candidates[0];
  const metadata = object(connection.metadata);
  const sync = object(metadata.email_sync);
  await ChannelConnectionRuntime.connect({
    organization_id: connection.organization_id,
    provider: connection.provider,
    channel_type: connection.channel_type || "email",
    credentials_reference: connection.credentials_reference || null,
    metadata: {
      ...metadata,
      email_sync: {
        ...sync,
        push_requested_at: new Date().toISOString(),
        push_requested: true,
      },
    },
  });

  return {
    matched: true,
    organization_id: connection.organization_id,
    connection_id: connection.id,
  };
}
