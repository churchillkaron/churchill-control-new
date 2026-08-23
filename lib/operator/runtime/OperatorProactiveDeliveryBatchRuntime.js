import { mutateOperatorWatchProjectState } from "./OperatorWatchStateRepository";
import { mergeOperatorProjectState } from "@/lib/operator/contracts/OperatorProjectState";
import {
  deliverPendingOperatorProactiveAlert,
  queueOperatorProactiveDelivery,
} from "./OperatorProactiveDeliveryRuntime";

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function pendingInAppAlert(projectState) {
  const alert = object(projectState?.business_watch?.pending_alert);
  if (!text(alert.dedupe_key, 240)) return null;
  if (text(alert.status, 40).toLowerCase() !== "pending") return null;
  return alert;
}

async function prepareExternalAlert(scope) {
  return mutateOperatorWatchProjectState({
    organizationId: scope.organizationId,
    partyId: scope.partyId,
    conversationId: scope.conversationId,
    mutate: ({ projectState }) => {
      const watch = object(projectState.business_watch);
      const alert = pendingInAppAlert(projectState);
      if (!alert) {
        return {
          skip: true,
          outcome: { queued: false, reason: "NO_IN_APP_ALERT_PENDING" },
        };
      }

      const nextWatch = queueOperatorProactiveDelivery(watch, alert);
      if (nextWatch === watch) {
        return {
          skip: true,
          outcome: { queued: false, reason: "EXTERNAL_DELIVERY_NOT_QUEUED" },
        };
      }

      return {
        projectState: mergeOperatorProjectState(
          projectState,
          projectState,
          { business_watch: nextWatch },
        ),
        outcome: {
          queued: true,
          dedupe_key: text(alert.dedupe_key, 240),
        },
      };
    },
  });
}

async function deliverForWatchResult(result, now) {
  const scope = {
    organizationId: text(result?.organization_id, 120),
    partyId: text(result?.party_id, 120),
    conversationId: text(result?.conversation_id, 120),
  };
  if (!scope.organizationId || !scope.partyId || !scope.conversationId) {
    return {
      success: false,
      skipped: true,
      error: "OPERATOR_PROACTIVE_DELIVERY_SCOPE_REQUIRED",
    };
  }

  try {
    const prepared = await prepareExternalAlert(scope);
    const currentProjectState = object(prepared.projectState);
    const delivery = await deliverPendingOperatorProactiveAlert({
      organizationId: scope.organizationId,
      partyId: scope.partyId,
      entityId: text(result?.entity_id, 120) || null,
      conversationId: scope.conversationId,
      projectState: currentProjectState,
      now,
    });
    return {
      success: delivery.failed === 0,
      organization_id: scope.organizationId,
      conversation_id: scope.conversationId,
      queued: prepared?.outcome?.queued === true,
      attempted: delivery.attempted,
      delivered: delivery.delivered,
      failed: delivery.failed,
      skipped: delivery.skipped,
      results: delivery.results,
    };
  } catch (error) {
    return {
      success: false,
      organization_id: scope.organizationId,
      conversation_id: scope.conversationId,
      attempted: 0,
      delivered: 0,
      failed: 1,
      skipped: 0,
      error: text(error?.message || error, 400) || "Proactive delivery failed",
    };
  }
}

export async function runOperatorProactiveDeliveryForWatchResults({
  watchResults = [],
  now = new Date(),
} = {}) {
  const unique = new Map();
  for (const result of Array.isArray(watchResults) ? watchResults : []) {
    const conversationId = text(result?.conversation_id, 120);
    if (!conversationId) continue;
    unique.set(conversationId, result);
  }

  const results = [];
  for (const result of unique.values()) {
    results.push(await deliverForWatchResult(result, now));
  }

  const summary = {
    success: results.every((result) => result.success !== false),
    conversation_count: results.length,
    attempted_count: results.reduce((sum, result) => sum + Number(result.attempted || 0), 0),
    delivered_count: results.reduce((sum, result) => sum + Number(result.delivered || 0), 0),
    failed_count: results.reduce((sum, result) => sum + Number(result.failed || 0), 0),
    skipped_count: results.reduce((sum, result) => sum + Number(result.skipped || 0), 0),
    results,
  };

  console.info("OPERATOR_PROACTIVE_DELIVERY", JSON.stringify(summary));
  return summary;
}

export default runOperatorProactiveDeliveryForWatchResults;
