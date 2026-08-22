import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { scanOperatorAutonomousEvidence } from "./OperatorAutonomousEvidenceRuntime";
import { synthesizeOperatorBusinessThesis } from "./OperatorBusinessThesisRuntime";
import {
  cognitionBudgetSummary,
  evaluateAutonomousCognitionBudget,
} from "./OperatorAutonomousCognitionPolicy";
import { mutateOperatorWatchProjectState } from "./OperatorWatchStateRepository";
import {
  buildOperatorBusinessThesis,
  normalizeOperatorBusinessThesis,
} from "@/lib/operator/contracts/OperatorBusinessThesis";
import { mergeOperatorProjectState } from "@/lib/operator/contracts/OperatorProjectState";

const WATCH_VERSION = 2;
const DEFAULT_BATCH_LIMIT = 2;
const MAX_BATCH_LIMIT = 4;
const CANDIDATE_LIMIT = 240;
const ALERT_HISTORY_LIMIT = 8;
const RUN_LEASE_MS = 10 * 60 * 1000;
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

function activeLease(projectState, nowMs) {
  const lease = object(watchState(projectState).run_lease);
  const expiresAt = timestamp(lease.expires_at);
  return Boolean(text(lease.token, 120) && expiresAt !== null && expiresAt > nowMs);
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

function deferredThesis(previousThesis, previewThesis, reason) {
  const previous = normalizeOperatorBusinessThesis(previousThesis);
  const preview = normalizeOperatorBusinessThesis(previewThesis);
  if (!previous) return preview;

  return normalizeOperatorBusinessThesis({
    ...previous,
    evidence_fingerprint:
      preview?.evidence_fingerprint || previous.evidence_fingerprint || null,
    generated_at: preview?.generated_at || previous.generated_at || null,
    prediction_accountability:
      preview?.prediction_accountability || previous.prediction_accountability || null,
    change: {
      kind: "deferred_reassessment",
      material: false,
      evidence_changed: preview?.change?.evidence_changed === true,
      new_signals: [],
      resolved_signals: [],
      escalated_signals: [],
      deescalated_signals: [],
      recommendation_changed: false,
      summary:
        preview?.change?.evidence_changed === true
          ? `Live evidence changed, but semantic reassessment was deferred: ${reason}.`
          : "Live evidence is unchanged; the existing semantic thesis remains current.",
      computed_at: new Date().toISOString(),
    },
    interruption: {
      mode: "none",
      should_interrupt: false,
      should_surface: false,
      level: attentionLevel(previous),
      reason: null,
      dedupe_key: preview?.interruption?.dedupe_key || null,
    },
  });
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
    source: "synthetic-intelligence-watch-v2",
  };
}

function watchWithThesis(previousWatch, thesis, attention, cognition, nowMs) {
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
    run_lease: null,
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
    last_cognition: {
      mode: text(cognition?.mode, 80) || "deterministic_only",
      paid_reasoning_used: cognition?.paid_reasoning_used === true,
      reason: text(cognition?.reason, 180) || null,
      evaluated_at: nowIso,
      budget: cognition?.budget || null,
    },
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
    run_lease: null,
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
    metadata: {
      partyId: row.party_id,
      autonomous_cognition: true,
      autonomous_watch_version: "2",
      source: "AVANTIQO_SYNTHETIC_INTELLIGENCE_WATCH",
    },
  };
}

async function claimWatchRun(row, nowMs) {
  const token = crypto.randomUUID();
  const acquiredAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + RUN_LEASE_MS).toISOString();
  const persisted = await mutateOperatorWatchProjectState({
    organizationId: row.organization_id,
    partyId: row.party_id,
    conversationId: row.id,
    mutate: ({ projectState }) => {
      const current = object(projectState);
      if (!dueForCheck(current, nowMs)) {
        return {
          skip: true,
          outcome: { claimed: false, reason: "NOT_DUE" },
        };
      }
      if (activeLease(current, nowMs)) {
        return {
          skip: true,
          outcome: { claimed: false, reason: "ACTIVE_RUN_LEASE" },
        };
      }
      const watch = watchState(current);
      const nextProjectState = mergeOperatorProjectState(
        current,
        current,
        {
          business_watch: {
            ...watch,
            version: WATCH_VERSION,
            run_lease: {
              token,
              acquired_at: acquiredAt,
              expires_at: expiresAt,
              source: "vercel-cron",
            },
          },
        },
      );
      return {
        projectState: nextProjectState,
        outcome: { claimed: true, token, acquired_at: acquiredAt, expires_at: expiresAt },
      };
    },
  });
  return {
    claimed: persisted?.outcome?.claimed === true,
    reason: text(persisted?.outcome?.reason, 120) || null,
    token: text(persisted?.outcome?.token, 120) || null,
    attempt: Number(persisted?.attempt || 1),
  };
}

async function decideAutonomousThesis({ row, context, attention, nowMs }) {
  const previousThesis = object(row?.project_state).business_thesis || null;
  const preview = buildOperatorBusinessThesis({
    attention,
    previousThesis,
  });

  if (previousThesis && preview?.change?.evidence_changed === false) {
    return {
      thesis: deferredThesis(previousThesis, preview, "EVIDENCE_UNCHANGED"),
      cognition: {
        mode: "deterministic_reuse",
        paid_reasoning_used: false,
        reason: "EVIDENCE_UNCHANGED",
        budget: null,
      },
    };
  }

  const budgetDecision = await evaluateAutonomousCognitionBudget({
    organizationId: row.organization_id,
    projectState: object(row?.project_state),
    now: new Date(nowMs),
  });
  const budget = cognitionBudgetSummary(budgetDecision);

  if (
    budgetDecision.allowed !== true ||
    budgetDecision.policy?.deep_reasoning_on_change === false
  ) {
    const reason =
      budgetDecision.reason ||
      "AUTONOMOUS_COGNITION_DEEP_REASONING_DISABLED";
    return {
      thesis: deferredThesis(previousThesis, preview, reason),
      cognition: {
        mode: "deterministic_budget_guard",
        paid_reasoning_used: false,
        reason,
        budget,
      },
    };
  }

  const thesis = await synthesizeOperatorBusinessThesis({
    context: synthesisContext(context, row),
    attention,
    previousThesis,
  });
  return {
    thesis,
    cognition: {
      mode: "paid_semantic_reasoning",
      paid_reasoning_used: true,
      reason: previousThesis
        ? "LIVE_EVIDENCE_CHANGED"
        : "BOOTSTRAP_BUSINESS_THESIS",
      budget,
    },
  };
}

async function persistSuccessfulWatch({
  row,
  attention,
  thesis,
  cognition,
  nowMs,
  leaseToken,
}) {
  return mutateOperatorWatchProjectState({
    organizationId: row.organization_id,
    partyId: row.party_id,
    conversationId: row.id,
    mutate: async ({ projectState }) => {
      const latestProjectState = object(projectState);
      const latestWatchBefore = watchState(latestProjectState);
      if (text(latestWatchBefore?.run_lease?.token, 120) !== leaseToken) {
        return {
          skip: true,
          outcome: {
            lease_lost: true,
            thesis: latestProjectState.business_thesis || null,
            previous_watch: latestWatchBefore,
            next_watch: latestWatchBefore,
          },
        };
      }
      const latestThesis = object(latestProjectState.business_thesis);
      const observedPreviousThesis = object(row?.project_state?.business_thesis);
      const thesisChangedDuringScan =
        text(latestThesis.generated_at, 80) !==
        text(observedPreviousThesis.generated_at, 80);
      const rebasedPreview = thesisChangedDuringScan
        ? buildOperatorBusinessThesis({
            attention,
            previousThesis: latestThesis,
          })
        : null;
      const rebasedThesis = thesisChangedDuringScan
        ? deferredThesis(
            latestThesis,
            rebasedPreview,
            "CONCURRENT_THESIS_UPDATE",
          )
        : thesis;
      const finalCognition = thesisChangedDuringScan
        ? {
            ...object(cognition),
            mode: "concurrent_semantic_preservation",
            reason: "CONCURRENT_THESIS_UPDATE",
          }
        : cognition;
      const latestWatch = watchState(latestProjectState);
      const nextWatch = watchWithThesis(
        latestWatch,
        rebasedThesis,
        attention,
        finalCognition,
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
          lease_lost: false,
          thesis: rebasedThesis,
          cognition: finalCognition,
          previous_watch: latestWatch,
          next_watch: nextWatch,
          rebased_against_live_state: thesisChangedDuringScan,
        },
      };
    },
  });
}

async function persistFailedWatch({ row, error, nowMs, leaseToken }) {
  return mutateOperatorWatchProjectState({
    organizationId: row.organization_id,
    partyId: row.party_id,
    conversationId: row.id,
    mutate: ({ projectState }) => {
      const latestProjectState = object(projectState);
      const latestWatch = watchState(latestProjectState);
      if (
        leaseToken &&
        text(latestWatch?.run_lease?.token, 120) !== leaseToken
      ) {
        return {
          skip: true,
          outcome: { next_watch: latestWatch, lease_lost: true },
        };
      }
      const failedWatch = watchWithFailure(latestWatch, error, nowMs);
      return {
        projectState: mergeOperatorProjectState(
          latestProjectState,
          latestProjectState,
          { business_watch: failedWatch },
        ),
        outcome: { next_watch: failedWatch, lease_lost: false },
      };
    },
  });
}

async function processConversation(row, nowMs, access) {
  let leaseToken = null;
  try {
    const claim = await claimWatchRun(row, nowMs);
    if (!claim.claimed) {
      return {
        success: true,
        skipped: true,
        conversation_id: row.id,
        organization_id: row.organization_id,
        party_id: row.party_id,
        skip_reason: claim.reason || "WATCH_RUN_NOT_CLAIMED",
        claim_attempts: claim.attempt,
      };
    }
    leaseToken = claim.token;

    const context = watcherContext(row, access);
    const attention = await scanOperatorAutonomousEvidence({ context });
    const decision = await decideAutonomousThesis({
      row,
      context,
      attention,
      nowMs,
    });
    const persisted = await persistSuccessfulWatch({
      row,
      attention,
      thesis: decision.thesis,
      cognition: decision.cognition,
      nowMs,
      leaseToken,
    });
    const outcome = object(persisted.outcome);
    const finalThesis = object(outcome.thesis);
    const finalCognition = object(outcome.cognition);
    const previousWatch = object(outcome.previous_watch);
    const nextWatch = object(outcome.next_watch);

    return {
      success: outcome.lease_lost !== true,
      skipped: outcome.lease_lost === true,
      conversation_id: row.id,
      organization_id: row.organization_id,
      party_id: row.party_id,
      attention_status: text(attention?.status, 80) || null,
      thesis_level: attentionLevel(finalThesis),
      material_change: finalThesis?.change?.material === true,
      cognition_mode: text(finalCognition.mode, 80) || null,
      cognition_reason: text(finalCognition.reason, 180) || null,
      paid_reasoning_used: finalCognition.paid_reasoning_used === true,
      cognition_budget: finalCognition.budget || null,
      rebased_against_live_state:
        outcome.rebased_against_live_state === true,
      persistence_attempts: Number(persisted.attempt || 1),
      claim_attempts: claim.attempt,
      alert_queued:
        text(nextWatch?.pending_alert?.dedupe_key, 240) !==
          text(previousWatch?.pending_alert?.dedupe_key, 240) &&
        text(nextWatch?.pending_alert?.status, 40) === "pending",
      next_check_at: text(nextWatch.next_check_at, 80) || null,
    };
  } catch (error) {
    let nextCheckAtValue = null;
    try {
      const persistedFailure = await persistFailedWatch({
        row,
        error,
        nowMs,
        leaseToken,
      });
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
    .order("organization_id", { ascending: true })
    .order("id", { ascending: true })
    .limit(CANDIDATE_LIMIT);

  if (result.error) throw result.error;
  return list(result.data).filter(
    (row) => text(row?.organization_id, 120) && text(row?.party_id, 120),
  );
}

async function selectOrganizationOwnerWatchers(candidates, nowMs, limit) {
  const groups = new Map();
  for (const row of candidates) {
    if (!dueForCheck(object(row?.project_state), nowMs)) continue;
    const organizationId = text(row?.organization_id, 120);
    if (!groups.has(organizationId)) groups.set(organizationId, []);
    groups.get(organizationId).push(row);
  }

  const selected = [];
  let ownerCandidatesChecked = 0;
  for (const organizationId of [...groups.keys()].sort()) {
    const rows = groups.get(organizationId) || [];
    let chosen = null;
    let chosenAccess = null;
    for (const row of rows) {
      try {
        const access = await resolveWatcherAccess(row);
        ownerCandidatesChecked += 1;
        if (!FULL_ACCESS_ROLES.has(normalizeRole(access.role))) continue;
        chosen = row;
        chosenAccess = access;
        break;
      } catch (error) {
        console.warn("OPERATOR_AUTONOMOUS_WATCH_OWNER_CANDIDATE_SKIPPED", {
          organizationId,
          conversationId: row?.id || null,
          error: error?.message || error,
        });
      }
    }
    if (!chosen) continue;
    selected.push({ row: chosen, access: chosenAccess });
    if (selected.length >= limit) break;
  }

  return {
    selected,
    due_organization_count: groups.size,
    owner_candidates_checked: ownerCandidatesChecked,
  };
}

export async function runOperatorAutonomousWatchBatch({
  limit = DEFAULT_BATCH_LIMIT,
  now = new Date(),
} = {}) {
  const startedAt = Date.now();
  const max = clampLimit(limit);
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const candidates = await loadCandidates();
  const selection = await selectOrganizationOwnerWatchers(candidates, nowMs, max);
  const results = [];

  for (const candidate of selection.selected) {
    results.push(
      await processConversation(candidate.row, nowMs, candidate.access),
    );
  }

  const attempted = results.filter((item) => item.skipped !== true);
  const completed = attempted.filter((item) => item.success).length;
  const failed = attempted.length - completed;
  const skipped = results.length - attempted.length;
  const alertsQueued = results.filter((item) => item.alert_queued).length;
  const rebased = results.filter(
    (item) => item.rebased_against_live_state === true,
  ).length;
  const paidReasoning = results.filter(
    (item) => item.paid_reasoning_used === true,
  ).length;
  const leaseContention = results.filter(
    (item) => item.skip_reason === "ACTIVE_RUN_LEASE",
  ).length;

  const summary = {
    success: failed === 0,
    mode: "autonomous_read_only_cost_aware",
    candidate_count: candidates.length,
    due_organization_count: selection.due_organization_count,
    owner_candidates_checked: selection.owner_candidates_checked,
    selected_owner_watchers: selection.selected.length,
    processed_count: attempted.length,
    completed_count: completed,
    failed_count: failed,
    skipped_count: skipped,
    lease_contention_count: leaseContention,
    alerts_queued: alertsQueued,
    rebased_count: rebased,
    paid_reasoning_count: paidReasoning,
    deterministic_only_count: completed - paidReasoning,
    duration_ms: Date.now() - startedAt,
    results,
  };

  console.info("OPERATOR_AUTONOMOUS_WATCH_V2", JSON.stringify(summary));
  return summary;
}

export default runOperatorAutonomousWatchBatch;
