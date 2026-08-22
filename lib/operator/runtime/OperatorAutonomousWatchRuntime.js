import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { scanOperatorAttention } from "./OperatorAnticipatoryRuntime";
import { synthesizeOperatorBusinessThesis } from "./OperatorBusinessThesisRuntime";
import { mergeOperatorProjectState } from "@/lib/operator/contracts/OperatorProjectState";
import { updateIntelligenceConversationState } from "./IntelligenceConversationRuntime";

const WATCH_VERSION = 1;
const DEFAULT_BATCH_LIMIT = 12;
const MAX_BATCH_LIMIT = 40;
const CANDIDATE_LIMIT = 240;
const ALERT_HISTORY_LIMIT = 8;

const CADENCE_MS = Object.freeze({
  urgent: 15 * 60 * 1000,
  important: 30 * 60 * 1000,
  watch: 60 * 60 * 1000,
  clear: 3 * 60 * 60 * 1000,
});

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

function clampLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_BATCH_LIMIT;
  return Math.max(1, Math.min(Math.floor(numeric), MAX_BATCH_LIMIT));
}

function timestamp(value) {
  const parsed = Date.parse(text(value, 80));
  return Number.isFinite(parsed) ? parsed : null;
}

function attentionLevel(thesis) {
  const level = text(thesis?.attention_level, 40).toLowerCase();
  return ["urgent", "important", "watch", "clear"].includes(level)
    ? level
    : "clear";
}

function watchState(projectState) {
  return object(projectState?.business_watch);
}

function watchEnabled(projectState) {
  const watch = watchState(projectState);
  if (watch.enabled === false) return false;
  if (watch.enabled === true) return true;
  return Boolean(
    object(projectState?.business_thesis).summary ||
      text(projectState?.last_attention_scan_at, 80),
  );
}

function dueForCheck(projectState, nowMs) {
  if (!watchEnabled(projectState)) return false;
  const nextCheck = timestamp(watchState(projectState).next_check_at);
  return nextCheck === null || nextCheck <= nowMs;
}

function nextCheckAt(thesis, nowMs) {
  const interval = CADENCE_MS[attentionLevel(thesis)] || CADENCE_MS.clear;
  return new Date(nowMs + interval).toISOString();
}

function failureNextCheckAt(previousWatch, nowMs) {
  const failures = Math.max(0, Number(previousWatch?.consecutive_failures || 0)) + 1;
  const interval = Math.min(
    6 * 60 * 60 * 1000,
    15 * 60 * 1000 * 2 ** Math.min(failures, 5),
  );
  return {
    failures,
    next_check_at: new Date(nowMs + interval).toISOString(),
  };
}

function compactAlertHistory(value) {
  return list(value)
    .slice(-ALERT_HISTORY_LIMIT)
    .map((item) => ({
      dedupe_key: text(item?.dedupe_key, 240) || null,
      mode: text(item?.mode, 40) || null,
      level: text(item?.level, 40) || null,
      status: text(item?.status, 40) || null,
      title: text(item?.title, 180) || null,
      created_at: text(item?.created_at, 80) || null,
      delivered_at: text(item?.delivered_at, 80) || null,
      superseded_at: text(item?.superseded_at, 80) || null,
    }))
    .filter((item) => item.dedupe_key);
}

function alertFromThesis(thesis, nowIso) {
  const interruption = object(thesis?.interruption);
  if (interruption.should_surface !== true) return null;

  const dedupeKey = text(interruption.dedupe_key, 240);
  if (!dedupeKey) return null;

  const primarySignal = list(thesis?.signals)[0] || null;
  return {
    dedupe_key: dedupeKey,
    mode: interruption.should_interrupt === true ? "interrupt" : "surface",
    level: attentionLevel(thesis),
    status: "pending",
    title:
      text(interruption.reason, 180) ||
      text(primarySignal?.title, 180) ||
      "Business thesis changed",
    message:
      text(thesis?.change?.summary, 900) ||
      text(thesis?.summary, 900) ||
      "The evidence-backed business thesis materially changed.",
    recommended_next_move:
      text(thesis?.recommended_next_move, 800) || null,
    thesis_generated_at: text(thesis?.generated_at, 80) || null,
    created_at: nowIso,
    source: "synthetic-intelligence-watch-v1",
  };
}

function watchWithThesis(previousWatch, thesis, attention, nowMs) {
  const nowIso = new Date(nowMs).toISOString();
  const previousPending = object(previousWatch?.pending_alert);
  const nextAlert = alertFromThesis(thesis, nowIso);
  const sameAlert = Boolean(
    nextAlert &&
      text(previousWatch?.last_queued_dedupe_key, 240) === nextAlert.dedupe_key,
  );
  let pendingAlert = Object.keys(previousPending).length ? previousPending : null;
  let alertHistory = compactAlertHistory(previousWatch?.alert_history);
  let lastQueuedDedupeKey = text(previousWatch?.last_queued_dedupe_key, 240) || null;

  if (nextAlert && !sameAlert) {
    if (pendingAlert?.dedupe_key) {
      alertHistory = [
        ...alertHistory,
        {
          ...pendingAlert,
          status:
            text(pendingAlert.status, 40) === "pending"
              ? "superseded"
              : text(pendingAlert.status, 40) || "superseded",
          superseded_at: nowIso,
        },
      ].slice(-ALERT_HISTORY_LIMIT);
    }
    pendingAlert = nextAlert;
    lastQueuedDedupeKey = nextAlert.dedupe_key;
  }

  return {
    ...object(previousWatch),
    version: WATCH_VERSION,
    enabled: previousWatch?.enabled !== false,
    mode: "autonomous_read_only",
    last_checked_at: nowIso,
    next_check_at: nextCheckAt(thesis, nowMs),
    consecutive_failures: 0,
    last_error: null,
    last_attention_status: text(attention?.status, 80) || null,
    last_thesis_level: attentionLevel(thesis),
    last_thesis_generated_at: text(thesis?.generated_at, 80) || null,
    last_queued_dedupe_key: lastQueuedDedupeKey,
    pending_alert: pendingAlert,
    alert_history: alertHistory,
  };
}

function watchWithFailure(previousWatch, error, nowMs) {
  const nowIso = new Date(nowMs).toISOString();
  const backoff = failureNextCheckAt(previousWatch, nowMs);
  return {
    ...object(previousWatch),
    version: WATCH_VERSION,
    enabled: previousWatch?.enabled !== false,
    mode: "autonomous_read_only",
    last_checked_at: nowIso,
    next_check_at: backoff.next_check_at,
    consecutive_failures: backoff.failures,
    last_error: text(error?.message || error, 800) || "Autonomous watch failed",
  };
}

function watcherContext(row) {
  const partyId = text(row?.party_id, 120);
  return {
    organizationId: text(row?.organization_id, 120),
    entityId: text(row?.entity_id, 120) || null,
    periodId: text(row?.period_id, 120) || null,
    actor: {
      id: null,
      partyId,
      party_id: partyId,
      role: "SYNTHETIC_INTELLIGENCE_WATCHER",
      fullAccess: true,
      system: true,
    },
    permissions: ["*"],
    installedModules: [],
    featureFlags: {},
    locale: null,
    currency: null,
    timezone: null,
    callerRequest: null,
    metadata: {
      source: "AVANTIQO_SYNTHETIC_INTELLIGENCE_WATCH",
      channel: "autonomous_watch",
      partyId,
      readOnly: true,
    },
  };
}

async function persistWatchState(row, projectState, agreementState) {
  await updateIntelligenceConversationState({
    organizationId: row.organization_id,
    conversationId: row.id,
    agreementState: object(agreementState),
    projectState,
  });
}

async function processConversation(row, nowMs) {
  const previousProjectState = object(row?.project_state);
  const previousWatch = watchState(previousProjectState);
  const context = watcherContext(row);

  try {
    const attention = await scanOperatorAttention({
      context,
      forceRefresh: true,
    });
    const thesis = await synthesizeOperatorBusinessThesis({
      context: {
        organizationId: context.organizationId,
        entityId: context.entityId,
        partyId: row.party_id,
        metadata: { partyId: row.party_id },
      },
      attention,
      previousThesis: previousProjectState.business_thesis || null,
    });
    const nextWatch = watchWithThesis(previousWatch, thesis, attention, nowMs);
    const nextProjectState = mergeOperatorProjectState(
      previousProjectState,
      {
        ...previousProjectState,
        business_thesis: thesis,
      },
      {
        business_watch: nextWatch,
        last_attention_scan_at:
          text(attention?.generated_at, 80) || new Date(nowMs).toISOString(),
      },
    );

    await persistWatchState(row, nextProjectState, row.agreement_state);

    return {
      success: true,
      conversation_id: row.id,
      organization_id: row.organization_id,
      party_id: row.party_id,
      attention_status: text(attention?.status, 80) || null,
      thesis_level: attentionLevel(thesis),
      material_change: thesis?.change?.material === true,
      alert_queued:
        text(nextWatch?.pending_alert?.dedupe_key, 240) !==
          text(previousWatch?.pending_alert?.dedupe_key, 240) &&
        text(nextWatch?.pending_alert?.status, 40) === "pending",
      next_check_at: nextWatch.next_check_at,
    };
  } catch (error) {
    const failedWatch = watchWithFailure(previousWatch, error, nowMs);
    const failedProjectState = mergeOperatorProjectState(
      previousProjectState,
      previousProjectState,
      { business_watch: failedWatch },
    );

    try {
      await persistWatchState(row, failedProjectState, row.agreement_state);
    } catch (persistError) {
      console.error("OPERATOR_AUTONOMOUS_WATCH_FAILURE_PERSIST_FAILED", {
        conversationId: row?.id || null,
        organizationId: row?.organization_id || null,
        error: persistError?.message || persistError,
      });
    }

    return {
      success: false,
      conversation_id: row?.id || null,
      organization_id: row?.organization_id || null,
      party_id: row?.party_id || null,
      error: text(error?.message || error, 800) || "Autonomous watch failed",
      next_check_at: failedWatch.next_check_at,
    };
  }
}

async function loadCandidates() {
  const result = await supabaseAdmin
    .from("intelligence_conversations")
    .select(
      "id, organization_id, party_id, entity_id, period_id, conversation_key, agreement_state, project_state, updated_at, last_message_at",
    )
    .eq("conversation_key", "primary")
    .order("updated_at", { ascending: true })
    .limit(CANDIDATE_LIMIT);

  if (result.error) throw result.error;
  return list(result.data).filter(
    (row) => text(row?.organization_id, 120) && text(row?.party_id, 120),
  );
}

export async function runOperatorAutonomousWatchBatch({
  limit = DEFAULT_BATCH_LIMIT,
  now = new Date(),
} = {}) {
  const startedAt = Date.now();
  const max = clampLimit(limit);
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const candidates = await loadCandidates();
  const due = candidates
    .filter((row) => dueForCheck(object(row?.project_state), nowMs))
    .slice(0, max);
  const results = [];

  for (const row of due) {
    results.push(await processConversation(row, nowMs));
  }

  const completed = results.filter((item) => item.success).length;
  const failed = results.length - completed;
  const alertsQueued = results.filter((item) => item.alert_queued).length;

  const summary = {
    success: failed === 0,
    mode: "autonomous_read_only",
    candidate_count: candidates.length,
    due_count: due.length,
    processed_count: results.length,
    completed_count: completed,
    failed_count: failed,
    alerts_queued: alertsQueued,
    duration_ms: Date.now() - startedAt,
    results,
  };

  console.info("OPERATOR_AUTONOMOUS_WATCH_V1", JSON.stringify(summary));
  return summary;
}

export default runOperatorAutonomousWatchBatch;