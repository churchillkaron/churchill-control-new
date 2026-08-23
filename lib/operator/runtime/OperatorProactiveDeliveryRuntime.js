import crypto from "node:crypto";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { mutateOperatorWatchProjectState } from "./OperatorWatchStateRepository";
import { mergeOperatorProjectState } from "@/lib/operator/contracts/OperatorProjectState";
import {
  normalizeOperatorProactiveDeliveryPolicy,
  operatorProactiveDeliveryChannelDescriptor,
  operatorProactiveDeliveryLevelEligible,
} from "@/lib/operator/contracts/OperatorProactiveDeliveryPolicy";

const DELIVERY_LEASE_MS = 10 * 60 * 1000;
const DELIVERY_HISTORY_LIMIT = 24;

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function timestamp(value) {
  const parsed = Date.parse(text(value, 80));
  return Number.isFinite(parsed) ? parsed : null;
}

function currentExternalDelivery(projectState) {
  return object(projectState?.business_watch?.external_delivery);
}

function currentPendingAlert(projectState) {
  const alert = object(currentExternalDelivery(projectState).pending_alert);
  return text(alert.dedupe_key, 240) ? alert : null;
}

function eligibleChannels(projectState, alert) {
  const policy = normalizeOperatorProactiveDeliveryPolicy(projectState);
  if (policy.enabled !== true || policy.explicit_owner_opt_in !== true) return [];
  return policy.channels.filter((channel) =>
    channel.enabled !== false &&
    operatorProactiveDeliveryLevelEligible(
      alert?.level,
      channel.minimum_level || policy.default_minimum_level,
    ),
  );
}

function alertMessage(alert = {}) {
  return [
    `Avantiqo Synthetic Intelligence · ${text(alert.level, 40).toUpperCase() || "ALERT"}`,
    text(alert.title, 180),
    text(alert.message, 1200),
    text(alert.recommended_next_move, 800)
      ? `Recommended next move: ${text(alert.recommended_next_move, 800)}`
      : null,
    "Recommendation is not authorization. Open Avantiqo to review evidence and decide what to do.",
  ].filter(Boolean).join("\n\n").slice(0, 3000);
}

function serviceInput(channel, alert) {
  const descriptor = operatorProactiveDeliveryChannelDescriptor(channel.channel);
  if (!descriptor) throw new Error("OPERATOR_PROACTIVE_DELIVERY_CHANNEL_UNSUPPORTED");
  const message = alertMessage(alert);

  if (channel.channel === "email") {
    return {
      recipient: channel.destination,
      subject: `[Avantiqo] ${text(alert.level, 40) || "Business"}: ${text(alert.title, 140) || "Synthetic Intelligence alert"}`,
      message,
    };
  }
  if (channel.channel === "whatsapp") {
    return { recipient: channel.destination, message };
  }
  if (channel.channel === "line") {
    return {
      user_id: channel.destination,
      message,
      retry_key: crypto
        .createHash("sha256")
        .update(`${text(alert.dedupe_key, 240)}:${channel.channel}:${channel.destination}`)
        .digest("hex")
        .slice(0, 36),
    };
  }
  throw new Error("OPERATOR_PROACTIVE_DELIVERY_CHANNEL_UNSUPPORTED");
}

function historyRecord(channel, state) {
  return {
    dedupe_key: text(state?.dedupe_key, 240) || null,
    channel: channel.channel,
    provider_id: channel.provider_id,
    status: text(state?.status, 40) || null,
    attempt_count: Number(state?.attempt_count || 0),
    usage_id: text(state?.usage_id, 120) || null,
    delivered_at: text(state?.delivered_at, 80) || null,
    failed_at: text(state?.failed_at, 80) || null,
    error: text(state?.error, 300) || null,
  };
}

async function claimDelivery({ organizationId, partyId, conversationId, channel, alert, nowMs }) {
  const claimToken = crypto.randomUUID();
  const claimedAt = new Date(nowMs).toISOString();
  const leaseExpiresAt = new Date(nowMs + DELIVERY_LEASE_MS).toISOString();

  const persisted = await mutateOperatorWatchProjectState({
    organizationId,
    partyId,
    conversationId,
    mutate: ({ projectState }) => {
      const currentAlert = currentPendingAlert(projectState);
      if (!currentAlert || text(currentAlert.dedupe_key, 240) !== text(alert.dedupe_key, 240)) {
        return { skip: true, outcome: { claimed: false, reason: "EXTERNAL_ALERT_NOT_PENDING" } };
      }

      const eligible = eligibleChannels(projectState, currentAlert);
      const configured = eligible.find((candidate) =>
        candidate.channel === channel.channel &&
        candidate.provider_id === channel.provider_id &&
        candidate.destination === channel.destination,
      );
      if (!configured) {
        return { skip: true, outcome: { claimed: false, reason: "CHANNEL_NOT_ELIGIBLE" } };
      }

      const watch = object(projectState.business_watch);
      const external = object(watch.external_delivery);
      const channelStates = object(external.channels);
      const previous = object(channelStates[channel.channel]);
      if (
        text(previous.dedupe_key, 240) === text(alert.dedupe_key, 240) &&
        text(previous.status, 40).toLowerCase() === "delivered"
      ) {
        return { skip: true, outcome: { claimed: false, reason: "ALREADY_DELIVERED" } };
      }
      const activeUntil = timestamp(previous.lease_expires_at);
      if (
        text(previous.dedupe_key, 240) === text(alert.dedupe_key, 240) &&
        text(previous.status, 40).toLowerCase() === "delivering" &&
        activeUntil !== null && activeUntil > nowMs
      ) {
        return { skip: true, outcome: { claimed: false, reason: "ACTIVE_DELIVERY_LEASE" } };
      }

      const nextState = {
        dedupe_key: text(alert.dedupe_key, 240),
        status: "delivering",
        provider_id: channel.provider_id,
        destination: channel.destination,
        minimum_level: channel.minimum_level,
        attempt_count: Number(previous.attempt_count || 0) + 1,
        claim_token: claimToken,
        claimed_at: claimedAt,
        lease_expires_at: leaseExpiresAt,
        delivered_at: null,
        failed_at: null,
        usage_id: null,
        error: null,
      };

      const nextExternal = {
        ...external,
        channels: { ...channelStates, [channel.channel]: nextState },
      };
      const nextProjectState = mergeOperatorProjectState(
        projectState,
        projectState,
        { business_watch: { ...watch, external_delivery: nextExternal } },
      );
      return {
        projectState: nextProjectState,
        outcome: { claimed: true, claim_token: claimToken, attempt_count: nextState.attempt_count },
      };
    },
  });

  return object(persisted.outcome);
}

async function persistDeliveryResult({
  organizationId,
  partyId,
  conversationId,
  channel,
  alert,
  claimToken,
  result = null,
  error = null,
  nowMs,
}) {
  const deliveredAt = error ? null : new Date(nowMs).toISOString();
  const failedAt = error ? new Date(nowMs).toISOString() : null;
  return mutateOperatorWatchProjectState({
    organizationId,
    partyId,
    conversationId,
    mutate: ({ projectState }) => {
      const watch = object(projectState.business_watch);
      const external = currentExternalDelivery(projectState);
      const channelStates = object(external.channels);
      const previous = object(channelStates[channel.channel]);
      if (
        text(previous.dedupe_key, 240) !== text(alert.dedupe_key, 240) ||
        text(previous.claim_token, 120) !== claimToken
      ) {
        return { skip: true, outcome: { persisted: false, reason: "DELIVERY_CLAIM_LOST" } };
      }

      const nextState = {
        ...previous,
        status: error ? "failed" : "delivered",
        claim_token: null,
        lease_expires_at: null,
        usage_id: text(result?.usage?.id, 120) || null,
        settlement: text(result?.settlement, 80) || null,
        delivered_at: deliveredAt,
        failed_at: failedAt,
        error: error ? text(error?.message || error, 300) || "Delivery failed" : null,
      };
      const history = [
        ...list(external.history),
        historyRecord(channel, nextState),
      ].slice(-DELIVERY_HISTORY_LIMIT);
      const nextExternal = {
        ...external,
        channels: { ...channelStates, [channel.channel]: nextState },
        history,
        last_attempt_at: new Date(nowMs).toISOString(),
      };

      const allConfigured = eligibleChannels(projectState, alert);
      const allDelivered = allConfigured.length > 0 && allConfigured.every((candidate) => {
        const candidateState = candidate.channel === channel.channel
          ? nextState
          : object(channelStates[candidate.channel]);
        return (
          text(candidateState.dedupe_key, 240) === text(alert.dedupe_key, 240) &&
          text(candidateState.status, 40).toLowerCase() === "delivered"
        );
      });
      if (allDelivered) {
        nextExternal.pending_alert = null;
        nextExternal.last_completed_dedupe_key = text(alert.dedupe_key, 240);
        nextExternal.last_completed_at = deliveredAt;
      }

      return {
        projectState: mergeOperatorProjectState(
          projectState,
          projectState,
          { business_watch: { ...watch, external_delivery: nextExternal } },
        ),
        outcome: {
          persisted: true,
          delivered: !error,
          completed: allDelivered,
          status: nextState.status,
        },
      };
    },
  });
}

export function queueOperatorProactiveDelivery(previousWatch = {}, alert = null, now = new Date()) {
  const watch = object(previousWatch);
  if (!alert?.dedupe_key) return watch;
  const projectState = { business_watch: watch };
  const policy = normalizeOperatorProactiveDeliveryPolicy(projectState);
  if (policy.enabled !== true || policy.explicit_owner_opt_in !== true) return watch;
  const eligible = eligibleChannels(projectState, alert);
  if (!eligible.length) return watch;

  const nowIso = now instanceof Date ? now.toISOString() : new Date().toISOString();
  const external = object(watch.external_delivery);
  const previousAlert = object(external.pending_alert);
  if (text(previousAlert.dedupe_key, 240) === text(alert.dedupe_key, 240)) return watch;

  return {
    ...watch,
    external_delivery: {
      ...external,
      pending_alert: {
        ...alert,
        queued_at: nowIso,
        external_delivery_source: "owner_opt_in",
      },
      channels: {},
      queued_at: nowIso,
    },
  };
}

export async function deliverPendingOperatorProactiveAlert({
  organizationId,
  partyId,
  entityId = null,
  conversationId,
  projectState = {},
  now = new Date(),
} = {}) {
  const alert = currentPendingAlert(projectState);
  if (!alert) return { attempted: 0, delivered: 0, failed: 0, skipped: 0, results: [] };
  const channels = eligibleChannels(projectState, alert);
  if (!channels.length) return { attempted: 0, delivered: 0, failed: 0, skipped: 0, results: [] };

  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const results = [];
  for (const channel of channels) {
    const claim = await claimDelivery({
      organizationId,
      partyId,
      conversationId,
      channel,
      alert,
      nowMs,
    });
    if (claim.claimed !== true) {
      results.push({ channel: channel.channel, skipped: true, reason: text(claim.reason, 120) || "NOT_CLAIMED" });
      continue;
    }

    const descriptor = operatorProactiveDeliveryChannelDescriptor(channel.channel);
    try {
      const result = await ServiceExecutionRuntime.execute({
        organization_id: organizationId,
        party_id: partyId,
        entity_id: entityId,
        service_id: descriptor.service_id,
        provider_id: channel.provider_id,
        capability: descriptor.capability,
        input: serviceInput(channel, alert),
        category: "OPERATOR_PROACTIVE_ALERT",
        metadata: {
          source: "AVANTIQO_SYNTHETIC_INTELLIGENCE_WATCH",
          autonomous_delivery: true,
          alert_dedupe_key: text(alert.dedupe_key, 240),
          alert_level: text(alert.level, 40),
          channel: channel.channel,
          recommendation_is_not_authorization: true,
        },
      });
      if (result?.pending === true) {
        throw new Error("OPERATOR_PROACTIVE_DELIVERY_ASYNC_PROVIDER_UNSUPPORTED");
      }
      await persistDeliveryResult({
        organizationId,
        partyId,
        conversationId,
        channel,
        alert,
        claimToken: text(claim.claim_token, 120),
        result,
        nowMs,
      });
      results.push({
        channel: channel.channel,
        success: true,
        provider: text(result?.provider, 80) || channel.provider_id,
        usage_id: text(result?.usage?.id, 120) || null,
        settlement: text(result?.settlement, 80) || null,
      });
    } catch (error) {
      await persistDeliveryResult({
        organizationId,
        partyId,
        conversationId,
        channel,
        alert,
        claimToken: text(claim.claim_token, 120),
        error,
        nowMs,
      }).catch(() => null);
      results.push({
        channel: channel.channel,
        success: false,
        error: text(error?.message || error, 300) || "Delivery failed",
      });
    }
  }

  return {
    attempted: results.filter((item) => item.skipped !== true).length,
    delivered: results.filter((item) => item.success === true).length,
    failed: results.filter((item) => item.success === false).length,
    skipped: results.filter((item) => item.skipped === true).length,
    results,
  };
}

export function operatorProactiveDeliveryStatus(projectState = {}) {
  const external = currentExternalDelivery(projectState);
  const pending = object(external.pending_alert);
  const states = object(external.channels);
  return {
    pending: Boolean(text(pending.dedupe_key, 240)),
    pending_dedupe_key: text(pending.dedupe_key, 240) || null,
    pending_level: text(pending.level, 40) || null,
    queued_at: text(pending.queued_at || external.queued_at, 80) || null,
    last_attempt_at: text(external.last_attempt_at, 80) || null,
    last_completed_at: text(external.last_completed_at, 80) || null,
    last_completed_dedupe_key: text(external.last_completed_dedupe_key, 240) || null,
    channels: Object.fromEntries(
      Object.entries(states).map(([channel, state]) => [
        channel,
        {
          status: text(state?.status, 40) || null,
          provider_id: text(state?.provider_id, 80) || null,
          attempt_count: Number(state?.attempt_count || 0),
          delivered_at: text(state?.delivered_at, 80) || null,
          failed_at: text(state?.failed_at, 80) || null,
          error: text(state?.error, 300) || null,
        },
      ]),
    ),
  };
}
