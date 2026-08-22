import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { scanOperatorAttention } from "./OperatorAnticipatoryRuntime";
import { synthesizeOperatorBusinessThesis } from "./OperatorBusinessThesisRuntime";
import { mutateOperatorWatchProjectState } from "./OperatorWatchStateRepository";
import { mergeOperatorProjectState } from "@/lib/operator/contracts/OperatorProjectState";

const WATCH_VERSION = 1;
const DEFAULT_BATCH_LIMIT = 2;
const MAX_BATCH_LIMIT = 4;
const CANDIDATE_LIMIT = 240;
const ALERT_HISTORY_LIMIT = 8;
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

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

function normalizeRole(value) {
  return text(value, 120).toUpperCase();
}

function permissionValues(value, prefix = "") {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => permissionValues(entry, prefix));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (entry === true) return [path];
      if (entry === false || entry === null || entry === undefined) return [];
      return permissionValues(entry, path);
    });
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => (prefix ? `${prefix}.${entry}` : entry));
  }
  return [];
}

function permissionSet(subject = {}) {
  return [
    subject.permissions,
    subject.permission_keys,
    subject.role_permissions,
    subject.access_permissions,
    subject.scopes,
    subject.metadata?.permissions,
    subject.metadata?.permission_keys,
    subject.role?.permissions,
  ]
    .flatMap((value) => permissionValues(value))
    .map((value) => text(value, 240).toLowerCase())
    .filter(Boolean);
}

function resolvedRole(staff = {}, membership = {}) {
  return (
    membership.role_key ||
    membership.role_code ||
    (typeof membership.role === "string" ? membership.role : membership.role?.key) ||
    membership.access_role ||
    staff.role_key ||
    staff.role_code ||
    (typeof staff.role === "string" ? staff.role : staff.role?.key) ||
    staff.access_role ||
    null
  );
}

function recordActive(record = {}) {
  if (record.archived === true) return false;
  if (record.active === false || record.is_active === false || record.enabled === false) {
    return false;
  }
  const status = text(record.status, 80).toUpperCase();
  return ![
    "INACTIVE",
    "DISABLED",
    "SUSPENDED",
    "TERMINATED",
    "ARCHIVED",
    "REVOKED",
  ].includes(status);
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
  return watchState(projectState).enabled !== false;
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

async function resolveWatcherAccess(row) {
  const organizationId = text(row?.organization_id, 120);
  const partyId = text(row?.party_id, 120);
  if (!organizationId || !partyId) {
    throw new Error("OPERATOR_AUTONOMOUS_WATCH_SCOPE_REQUIRED");
  }

  const staffResult = await supabaseAdmin
    .from("staff_accounts")
    .select("*")
    .eq("party_id", partyId)
    .limit(100);
  if (staffResult.error) throw staffResult.error;

  const staffRows = list(staffResult.data).filter(recordActive);
  if (!staffRows.length) throw new Error("OPERATOR_AUTONOMOUS_WATCH_STAFF_NOT_FOUND");
  const staffIds = staffRows.map((staff) => text(staff?.id, 120)).filter(Boolean);
  if (!staffIds.length) throw new Error("OPERATOR_AUTONOMOUS_WATCH_STAFF_ID_REQUIRED");

  const membershipResult = await supabaseAdmin
    .from("organization_users")
    .select("*")
    .eq("organization_id", organizationId)
    .in("staff_account_id", staffIds)
    .limit(100);
  if (membershipResult.error) throw membershipResult.error;

  const memberships = list(membershipResult.data).filter(recordActive);
  const membershipByStaffId = new Map(
    memberships.map((membership) => [text(membership?.staff_account_id, 120), membership]),
  );
  const staff = staffRows.find((candidate) => {
    const staffId = text(candidate?.id, 120);
    return (
      text(candidate?.organization_id, 120) === organizationId ||
      text(candidate?.active_organization_id, 120) === organizationId ||
      membershipByStaffId.has(staffId)
    );
  });
  if (!staff) throw new Error("OPERATOR_AUTONOMOUS_WATCH_MEMBERSHIP_REQUIRED");

  const membership = membershipByStaffId.get(text(staff.id, 120)) || {};
  const role = resolvedRole(staff, membership);
  const permissions = [
    ...permissionSet(staff),
    ...permissionSet(membership),
  ];
  if (FULL_ACCESS_ROLES.has(normalizeRole(role))) permissions.push("*");

  return {
    staff,
    membership,
    role,
    permissions: [...new Set(permissions)],
  };
}

function watcherContext(row, access) {
  const partyId = text(row?.party_id, 120);
  return {
    organizationId: text(row?.organization_id, 120),
    entityId: text(row?.entity_id, 120) || null,
    periodId: text(row?.period_id, 120) || null,
    actor: {
      id: text(access?.staff?.auth_user_id, 120) || null,
      partyId,
      party_id: partyId,
      staffAccountId: text(access?.staff?.id, 120) || null,
      role: access?.role || null,
      permissions: list(access?.permissions),
      systemWatch: true,
    },
    permissions: list(access?.permissions),
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
      staffAccountId: text(access?.staff?.id, 120) || null,
    },
  };
}

function synthesisContext(context, row) {
  return {
    organizationId: context.organizationId,
    entityId: context.entityId,
    partyId: row.party_id,
    metadata: { partyId: row.party_id },
  };
}

async function persistSuccessfulWatch({ row, context, attention, thesis, nowMs }) {
  return mutateOperatorWatchProjectState({
    organizationId: row.organization_id,
    partyId: row.party_id,
    conversationId: row.id,
    mutate: async ({ projectState }) => {
      const latestProjectState = object(projectState);
      const latestThesis = object(latestProjectState.business_thesis);
      const observedPreviousThesis = object(row?.project_state?.business_thesis);
      const thesisChangedDuringScan =
        text(latestThesis.generated_at, 80) !==
        text(observedPreviousThesis.generated_at, 80);
      const rebasedThesis = thesisChangedDuringScan
        ? await synthesizeOperatorBusinessThesis({
            context: synthesisContext(context, row),
            attention,
            previousThesis: latestThesis,
          })
        : thesis;
      const latestWatch = watchState(latestProjectState);
      const nextWatch = watchWithThesis(
        latestWatch,
        rebasedThesis,
        attention,
        nowMs,
      );
      const nextProjectState = mergeOperatorProjectState(
        latestProjectState,
        {
          ...latestProjectState,
          business_thesis: rebasedThesis,
        },
        {
          business_watch: nextWatch,
          last_attention_scan_at:
            text(attention?.generated_at, 80) || new Date(nowMs).toISOString(),
        },
      );

      return {
        projectState: nextProjectState,
        outcome: {
          thesis: rebasedThesis,
          previous_watch: latestWatch,
          next_watch: nextWatch,
          rebased_against_live_state: thesisChangedDuringScan,
        },
      };
    },
  });
}

async function persistFailedWatch({ row, error, nowMs }) {
  return mutateOperatorWatchProjectState({
    organizationId: row.organization_id,
    partyId: row.party_id,
    conversationId: row.id,
    mutate: ({ projectState }) => {
      const latestProjectState = object(projectState);
      const failedWatch = watchWithFailure(
        watchState(latestProjectState),
        error,
        nowMs,
      );
      return {
        projectState: mergeOperatorProjectState(
          latestProjectState,
          latestProjectState,
          { business_watch: failedWatch },
        ),
        outcome: { next_watch: failedWatch },
      };
    },
  });
}

async function processConversation(row, nowMs) {
  try {
    const access = await resolveWatcherAccess(row);
    const context = watcherContext(row, access);
    const attention = await scanOperatorAttention({
      context,
      forceRefresh: true,
    });
    const thesis = await synthesizeOperatorBusinessThesis({
      context: synthesisContext(context, row),
      attention,
      previousThesis: object(row?.project_state).business_thesis || null,
    });
    const persisted = await persistSuccessfulWatch({
      row,
      context,
      attention,
      thesis,
      nowMs,
    });
    const outcome = object(persisted.outcome);
    const finalThesis = object(outcome.thesis);
    const previousWatch = object(outcome.previous_watch);
    const nextWatch = object(outcome.next_watch);

    return {
      success: true,
      conversation_id: row.id,
      organization_id: row.organization_id,
      party_id: row.party_id,
      attention_status: text(attention?.status, 80) || null,
      thesis_level: attentionLevel(finalThesis),
      material_change: finalThesis?.change?.material === true,
      rebased_against_live_state:
        outcome.rebased_against_live_state === true,
      persistence_attempts: Number(persisted.attempt || 1),
      alert_queued:
        text(nextWatch?.pending_alert?.dedupe_key, 240) !==
          text(previousWatch?.pending_alert?.dedupe_key, 240) &&
        text(nextWatch?.pending_alert?.status, 40) === "pending",
      next_check_at: text(nextWatch.next_check_at, 80) || null,
    };
  } catch (error) {
    let nextCheckAtValue = null;
    try {
      const persistedFailure = await persistFailedWatch({ row, error, nowMs });
      nextCheckAtValue = text(
        persistedFailure?.outcome?.next_watch?.next_check_at,
        80,
      ) || null;
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
      next_check_at: nextCheckAtValue,
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
  const rebased = results.filter(
    (item) => item.rebased_against_live_state === true,
  ).length;

  const summary = {
    success: failed === 0,
    mode: "autonomous_read_only",
    candidate_count: candidates.length,
    due_count: due.length,
    processed_count: results.length,
    completed_count: completed,
    failed_count: failed,
    alerts_queued: alertsQueued,
    rebased_count: rebased,
    duration_ms: Date.now() - startedAt,
    results,
  };

  console.info("OPERATOR_AUTONOMOUS_WATCH_V1", JSON.stringify(summary));
  return summary;
}

export default runOperatorAutonomousWatchBatch;