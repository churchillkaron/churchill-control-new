import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { inspectMetaMessagingAccess } from "@/lib/platform/service-runtime/providers/meta/MetaMessagingAccessDiagnosticRuntime";
import { syncMetaCommunicationHistory } from "./CommunicationMetaInboxSyncRuntime";

const DEFAULT_SUCCESS_INTERVAL_HOURS = 24;
const DEFAULT_RETRY_INTERVAL_MINUTES = 5;
const STALE_RUNNING_MINUTES = 6;
const READINESS_REFRESH_HOURS = 6;
const MAX_ACTIVE_META_CONNECTIONS = 100;
const MAX_READINESS_PREFLIGHT = 3;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), minimum), maximum);
}

function timestamp(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeError(error) {
  return {
    message: text(error?.message) || "Meta communication history synchronization failed",
    code: text(error?.code) || null,
    subcode: text(error?.subcode) || null,
  };
}

function readinessIsStale(metadata, now = Date.now()) {
  const checkedAt = timestamp(object(metadata).messaging_readiness_checked_at);
  if (!checkedAt) return true;
  return now - checkedAt >= READINESS_REFRESH_HOURS * 60 * 60 * 1000;
}

async function listActiveMetaConnections() {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("id,organization_id,provider,status,credentials_reference,metadata,updated_at")
    .eq("provider", "meta")
    .eq("status", "ACTIVE")
    .limit(MAX_ACTIVE_META_CONNECTIONS);

  if (error) throw error;
  return data || [];
}

async function latestCommunicationActivity(organizationIds) {
  const ids = [...new Set((organizationIds || []).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabaseAdmin
    .from("communication_conversations")
    .select("organization_id,last_message_at")
    .in("organization_id", ids)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(ids.length * 250, 250), 5000));

  if (error) throw error;

  const latestByOrganization = new Map();
  for (const row of data || []) {
    if (!row?.organization_id || latestByOrganization.has(row.organization_id)) continue;
    latestByOrganization.set(row.organization_id, row.last_message_at || null);
  }
  return latestByOrganization;
}

function isDue({ metadata, now, successIntervalMs, retryIntervalMs }) {
  const lastSuccessAt = timestamp(metadata.communication_history_sync_at);
  const lastAttemptAt = timestamp(metadata.communication_history_sync_attempt_at);
  const status = text(metadata.communication_history_sync_status).toUpperCase();
  const staleRunningMs = STALE_RUNNING_MINUTES * 60 * 1000;

  if (status === "RUNNING" && lastAttemptAt && now - lastAttemptAt < staleRunningMs) {
    return false;
  }

  const successDue = !lastSuccessAt || now - lastSuccessAt >= successIntervalMs;
  const retryDue = !lastAttemptAt || now - lastAttemptAt >= retryIntervalMs || status === "RUNNING";
  return successDue && retryDue;
}

async function updateConnectionMetadata({ connection, patch }) {
  const { data: current, error: readError } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("metadata")
    .eq("id", connection.id)
    .eq("organization_id", connection.organization_id)
    .eq("provider", "meta")
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (readError) throw readError;
  if (!current) throw new Error("META_COMMUNICATION_CONNECTION_NOT_ACTIVE");

  const nextMetadata = {
    ...object(current.metadata),
    ...patch,
  };

  const { error } = await supabaseAdmin
    .from("organization_channel_connections")
    .update({ metadata: nextMetadata })
    .eq("id", connection.id)
    .eq("organization_id", connection.organization_id)
    .eq("provider", "meta")
    .eq("status", "ACTIVE");

  if (error) throw error;
  connection.metadata = nextMetadata;
}

async function inspectConnectionMessagingReadiness(connection) {
  const credentialId = text(connection.credentials_reference);
  const metadata = object(connection.metadata);
  const pageId = text(metadata.page_id);
  const instagramBusinessId = text(metadata.instagram_business_id);

  if (!credentialId || !pageId) {
    return {
      success: false,
      checked_at: new Date().toISOString(),
      ready_for_instagram_messaging: false,
      error: {
        message: !credentialId
          ? "Meta messaging credential reference is missing"
          : "Meta Page ID is missing",
        code: !credentialId
          ? "META_COMMUNICATION_CREDENTIAL_REQUIRED"
          : "META_PAGE_ID_REQUIRED_FOR_COMMUNICATION_SYNC",
        subcode: null,
      },
    };
  }

  try {
    const credential = await CredentialRuntime.resolve(credentialId);
    if (!credential?.secret_reference) {
      throw new Error("META_COMMUNICATION_CREDENTIAL_UNAVAILABLE");
    }

    return await inspectMetaMessagingAccess({
      access_token: credential.secret_reference,
      page_id: pageId,
      instagram_business_id: instagramBusinessId || null,
    });
  } catch (error) {
    return {
      success: false,
      checked_at: new Date().toISOString(),
      ready_for_instagram_messaging: false,
      error: safeError(error),
    };
  }
}

async function persistMessagingReadiness(connection) {
  const readiness = await inspectConnectionMessagingReadiness(connection);
  await updateConnectionMetadata({
    connection,
    patch: {
      messaging_readiness_checked_at: readiness.checked_at || new Date().toISOString(),
      messaging_readiness: readiness,
      messaging_granted_scopes: Array.isArray(readiness?.token?.granted_scopes)
        ? readiness.token.granted_scopes
        : [],
      messaging_required_scopes_missing: Array.isArray(readiness?.token?.missing_instagram_scopes)
        ? readiness.token.missing_instagram_scopes
        : [],
      messaging_page_instagram_link_ok:
        readiness?.page?.page_matches === true &&
        readiness?.page?.instagram_business_id_matches === true,
      messaging_webhook_subscription_healthy:
        readiness?.webhook_subscription?.healthy === true,
      instagram_messaging_ready: readiness.ready_for_instagram_messaging === true,
    },
  });
  return readiness;
}

export async function syncDueMetaCommunicationHistory({
  organizationLimit = 1,
  successIntervalHours = DEFAULT_SUCCESS_INTERVAL_HOURS,
  retryIntervalMinutes = DEFAULT_RETRY_INTERVAL_MINUTES,
} = {}) {
  const limit = boundedInteger(organizationLimit, 1, 1, 3);
  const successHours = boundedInteger(
    successIntervalHours,
    DEFAULT_SUCCESS_INTERVAL_HOURS,
    1,
    168,
  );
  const retryMinutes = boundedInteger(
    retryIntervalMinutes,
    DEFAULT_RETRY_INTERVAL_MINUTES,
    5,
    1440,
  );

  const connections = await listActiveMetaConnections();
  if (!connections.length) {
    return {
      success: true,
      connectedOrganizations: 0,
      eligibleOrganizations: 0,
      processedOrganizations: 0,
      results: [],
    };
  }

  const now = Date.now();
  const readinessPreflight = connections
    .filter((connection) => readinessIsStale(connection.metadata, now))
    .sort((left, right) => {
      const leftInstagram = Boolean(text(object(left.metadata).instagram_business_id));
      const rightInstagram = Boolean(text(object(right.metadata).instagram_business_id));
      if (leftInstagram !== rightInstagram) return leftInstagram ? -1 : 1;
      return timestamp(object(left.metadata).messaging_readiness_checked_at) -
        timestamp(object(right.metadata).messaging_readiness_checked_at);
    })
    .slice(0, MAX_READINESS_PREFLIGHT);

  for (const connection of readinessPreflight) {
    try {
      await persistMessagingReadiness(connection);
    } catch {
      // Readiness is advisory for history synchronization. Provider failures are handled below.
    }
  }

  const latestActivity = await latestCommunicationActivity(
    connections.map((connection) => connection.organization_id),
  );
  const successIntervalMs = successHours * 60 * 60 * 1000;
  const retryIntervalMs = retryMinutes * 60 * 1000;

  const candidates = connections
    .map((connection) => {
      const metadata = object(connection.metadata);
      return {
        connection,
        metadata,
        needsMessagingReadiness: readinessIsStale(metadata, now),
        hasInstagramBusinessId: Boolean(text(metadata.instagram_business_id)),
        latestMessageAt: latestActivity.get(connection.organization_id) || null,
      };
    })
    .filter(({ metadata }) => isDue({
      metadata,
      now,
      successIntervalMs,
      retryIntervalMs,
    }))
    .sort((left, right) => {
      if (left.needsMessagingReadiness !== right.needsMessagingReadiness) {
        return left.needsMessagingReadiness ? -1 : 1;
      }

      if (left.hasInstagramBusinessId !== right.hasInstagramBusinessId) {
        return left.hasInstagramBusinessId ? -1 : 1;
      }

      const activityDifference = timestamp(right.latestMessageAt) - timestamp(left.latestMessageAt);
      if (activityDifference) return activityDifference;

      const leftSuccessAt = timestamp(left.metadata.communication_history_sync_at);
      const rightSuccessAt = timestamp(right.metadata.communication_history_sync_at);
      if (leftSuccessAt !== rightSuccessAt) return leftSuccessAt - rightSuccessAt;

      return timestamp(left.connection.updated_at) - timestamp(right.connection.updated_at);
    });

  const selected = candidates.slice(0, limit);
  const results = [];

  for (const candidate of selected) {
    const attemptAt = new Date().toISOString();

    await updateConnectionMetadata({
      connection: candidate.connection,
      patch: {
        communication_history_sync_attempt_at: attemptAt,
        communication_history_sync_status: "RUNNING",
        communication_history_sync_error: null,
      },
    });

    try {
      const readiness = await persistMessagingReadiness(candidate.connection);
      const result = await syncMetaCommunicationHistory({
        organizationId: candidate.connection.organization_id,
      });
      const completedAt = new Date().toISOString();

      await updateConnectionMetadata({
        connection: candidate.connection,
        patch: {
          communication_history_sync_at: completedAt,
          communication_history_sync_attempt_at: attemptAt,
          communication_history_sync_status: "SUCCESS",
          communication_history_sync_error: null,
          communication_history_sync_summary: {
            connected: Boolean(result?.connected),
            remote_conversation_count: Number(result?.remoteConversationCount || 0),
            unclassified_conversation_count: Number(result?.unclassifiedConversationCount || 0),
            results: Array.isArray(result?.results) ? result.results : [],
          },
        },
      });

      results.push({
        organizationId: candidate.connection.organization_id,
        success: true,
        connected: Boolean(result?.connected),
        messagingReady: readiness.ready_for_instagram_messaging === true,
        webhookSubscriptionHealthy:
          readiness?.webhook_subscription?.healthy === true,
        remoteConversationCount: Number(result?.remoteConversationCount || 0),
        unclassifiedConversationCount: Number(result?.unclassifiedConversationCount || 0),
        results: Array.isArray(result?.results) ? result.results : [],
      });
    } catch (error) {
      const safe = safeError(error);
      try {
        await updateConnectionMetadata({
          connection: candidate.connection,
          patch: {
            communication_history_sync_attempt_at: attemptAt,
            communication_history_sync_status: "FAILED",
            communication_history_sync_error: safe,
          },
        });
      } catch {
        // Preserve the provider failure as the primary result.
      }

      results.push({
        organizationId: candidate.connection.organization_id,
        success: false,
        error: safe,
      });
    }
  }

  return {
    success: results.every((result) => result.success),
    connectedOrganizations: connections.length,
    eligibleOrganizations: candidates.length,
    processedOrganizations: results.length,
    readinessRefreshHours: READINESS_REFRESH_HOURS,
    successIntervalHours: successHours,
    retryIntervalMinutes: retryMinutes,
    results,
  };
}
