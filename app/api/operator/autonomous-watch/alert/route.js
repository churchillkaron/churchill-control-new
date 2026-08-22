export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  loadIntelligenceConversationSnapshot,
} from "@/lib/operator/runtime/IntelligenceConversationRuntime";
import {
  mutateOperatorWatchProjectState,
} from "@/lib/operator/runtime/OperatorWatchStateRepository";
import {
  mergeOperatorProjectState,
} from "@/lib/operator/contracts/OperatorProjectState";

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

async function resolveOwnerConversation(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
  });
  if (!access.success) {
    return { error: errorResponse(access.error, access.status || 403) };
  }

  const partyId = text(access.staff?.party_id || access.staff?.partyId, 120);
  if (!partyId) {
    return {
      error: errorResponse(
        "Authenticated staff account is not linked to a party",
        409,
      ),
    };
  }

  const snapshot = await loadIntelligenceConversationSnapshot({
    organizationId: access.organizationId,
    partyId,
    conversationKey: "primary",
  });

  return { access, partyId, snapshot };
}

function pendingAlert(projectState) {
  const alert = object(projectState?.business_watch?.pending_alert);
  if (!text(alert.dedupe_key, 240)) return null;
  if (text(alert.status, 40).toLowerCase() !== "pending") return null;
  return alert;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      text(url.searchParams.get("organizationId"), 120) ||
      text(url.searchParams.get("organization_id"), 120);
    const resolved = await resolveOwnerConversation(request, organizationId);
    if (resolved.error) return resolved.error;

    const projectState = object(resolved.snapshot?.conversation?.project_state);
    const watch = object(projectState.business_watch);

    return Response.json({
      success: true,
      alert: pendingAlert(projectState),
      watch: {
        enabled: watch.enabled !== false,
        mode: text(watch.mode, 80) || null,
        last_checked_at: text(watch.last_checked_at, 80) || null,
        next_check_at: text(watch.next_check_at, 80) || null,
        consecutive_failures: Number(watch.consecutive_failures || 0),
        last_error: text(watch.last_error, 800) || null,
        last_thesis_level: text(watch.last_thesis_level, 40) || null,
      },
    });
  } catch (error) {
    console.error("OPERATOR_AUTONOMOUS_WATCH_ALERT_LOAD_FAILED", error);
    return errorResponse(
      error?.message || "Autonomous watch alert load failed",
      error?.status || 500,
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(
      readValue(body, "organizationId", "organization_id"),
      120,
    );
    const dedupeKey = text(
      readValue(body, "dedupeKey", "dedupe_key"),
      240,
    );
    if (!dedupeKey) return errorResponse("dedupe_key required", 400);

    const resolved = await resolveOwnerConversation(request, organizationId);
    if (resolved.error) return resolved.error;
    if (!resolved.snapshot?.conversation?.id) {
      return errorResponse("Primary intelligence conversation not found", 404);
    }

    const conversationId = resolved.snapshot.conversation.id;
    const persisted = await mutateOperatorWatchProjectState({
      organizationId: resolved.access.organizationId,
      partyId: resolved.partyId,
      conversationId,
      mutate: ({ projectState }) => {
        const currentProjectState = object(projectState);
        const watch = object(currentProjectState.business_watch);
        const alert = pendingAlert(currentProjectState);
        if (!alert || text(alert.dedupe_key, 240) !== dedupeKey) {
          return {
            skip: true,
            outcome: {
              acknowledged: false,
              reason: "ALERT_NOT_PENDING",
            },
          };
        }

        const deliveredAt = new Date().toISOString();
        const delivered = {
          ...alert,
          status: "delivered",
          delivered_at: deliveredAt,
        };
        const history = [
          ...list(watch.alert_history),
          delivered,
        ].slice(-8);

        return {
          projectState: mergeOperatorProjectState(
            currentProjectState,
            currentProjectState,
            {
              business_watch: {
                ...watch,
                pending_alert: null,
                last_delivered_dedupe_key: dedupeKey,
                last_delivered_at: deliveredAt,
                alert_history: history,
              },
            },
          ),
          outcome: {
            acknowledged: true,
            delivered_at: deliveredAt,
          },
        };
      },
    });
    const outcome = object(persisted.outcome);

    return Response.json({
      success: true,
      acknowledged: outcome.acknowledged === true,
      ...(text(outcome.reason, 120) ? { reason: text(outcome.reason, 120) } : {}),
      ...(text(outcome.delivered_at, 80)
        ? { delivered_at: text(outcome.delivered_at, 80) }
        : {}),
      persistence_attempts: Number(persisted.attempt || 1),
    });
  } catch (error) {
    console.error("OPERATOR_AUTONOMOUS_WATCH_ALERT_ACK_FAILED", error);
    return errorResponse(
      error?.message || "Autonomous watch alert acknowledgement failed",
      error?.status || 500,
    );
  }
}
