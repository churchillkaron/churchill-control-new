export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  resolveOperationsRequestContext,
  searchParamsToObject,
} from "@/lib/operations/api/resolveOperationsRequestContext";
import {
  CANONICAL_OPERATIONS_CAPABILITY_CATALOG,
} from "@/lib/operations/runtime/CanonicalOperationsCapabilityCatalog";
import {
  hasOperationsPermission,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const KNOWN_CAPABILITIES = new Set(
  CANONICAL_OPERATIONS_CAPABILITY_CATALOG.map((capability) => capability.id),
);

const TERMINAL_STATUSES = new Set([
  "complete",
  "completed",
  "closed",
  "cancelled",
  "canceled",
  "resolved",
  "released",
  "archived",
  "done",
  "paid",
]);

const HIGH_PRIORITIES = new Set([
  "critical",
  "urgent",
  "highest",
  "high",
  "p1",
  "p2",
]);

const DUE_SOON_MS = 2 * 60 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function isTerminal(status) {
  return TERMINAL_STATUSES.has(normalized(status));
}

function isHighPriority(priority) {
  return HIGH_PRIORITIES.has(normalized(priority));
}

function localDateKey(value, timezone = "UTC") {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function dueTime(row) {
  if (!row?.due_at) return null;
  const due = new Date(row.due_at);
  return Number.isNaN(due.getTime()) ? null : due;
}

function actionability(row, now, timezone) {
  const due = dueTime(row);
  const terminal = isTerminal(row?.status);
  const overdue = Boolean(due && due < now && !terminal);
  const highPriority = isHighPriority(row?.priority) && !terminal;
  const unassigned = !row?.assigned_to && !terminal;
  const dueToday = Boolean(
    due && localDateKey(due, timezone) === localDateKey(now, timezone) && !terminal,
  );
  const dueSoon = Boolean(
    due && due >= now && due.getTime() - now.getTime() <= DUE_SOON_MS && !terminal,
  );

  if (overdue) {
    return {
      needs_intervention: true,
      actionability_state: "ATTENTION",
      actionability_reason: "OVERDUE_COMMITMENT",
      next_move: "Recover overdue work",
      next_move_detail: "Protect the missed commitment before healthy work is reshuffled.",
      rank_score: 1000 + (highPriority ? 100 : 0) + (unassigned ? 50 : 0),
      overdue,
      high_priority: highPriority,
      due_today: dueToday,
      due_soon: false,
      unassigned,
    };
  }

  if (unassigned) {
    return {
      needs_intervention: true,
      actionability_state: "UNASSIGNED",
      actionability_reason: "NO_ACCOUNTABLE_OWNER",
      next_move: "Assign accountable owner",
      next_move_detail: "Give the next move to a person before execution or dispatch continues.",
      rank_score: 800 + (highPriority ? 100 : 0) + (dueSoon ? 50 : 0),
      overdue,
      high_priority: highPriority,
      due_today: dueToday,
      due_soon: dueSoon,
      unassigned,
    };
  }

  if (highPriority) {
    return {
      needs_intervention: true,
      actionability_state: "PRIORITY",
      actionability_reason: "HIGH_PRIORITY_ACTIVE",
      next_move: "Protect priority work",
      next_move_detail: "Confirm timing, ownership and constraints before lower-priority work moves.",
      rank_score: 650 + (dueSoon ? 75 : 0),
      overdue,
      high_priority: highPriority,
      due_today: dueToday,
      due_soon: dueSoon,
      unassigned,
    };
  }

  if (dueSoon) {
    return {
      needs_intervention: true,
      actionability_state: "DUE_SOON",
      actionability_reason: "COMMITMENT_DUE_WITHIN_TWO_HOURS",
      next_move: "Protect the next commitment",
      next_move_detail: "This work is approaching its due time. Confirm it can move without creating a service failure.",
      rank_score: 500,
      overdue,
      high_priority: highPriority,
      due_today: dueToday,
      due_soon: dueSoon,
      unassigned,
    };
  }

  return {
    needs_intervention: false,
    actionability_state: dueToday ? "TODAY" : "ACTIVE",
    actionability_reason: dueToday ? "SCHEDULED_TODAY" : "HEALTHY_ACTIVE_WORK",
    next_move: dueToday ? "Continue today’s work" : "Continue active work",
    next_move_detail: dueToday
      ? "The commitment is healthy and already in today’s operating flow."
      : "No surfaced exception requires human intervention right now.",
    rank_score: dueToday ? 100 : 0,
    overdue,
    high_priority: highPriority,
    due_today: dueToday,
    due_soon: dueSoon,
    unassigned,
  };
}

function parseCapabilities(value) {
  return [...new Set(
    text(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => KNOWN_CAPABILITIES.has(item)),
  )].slice(0, 30);
}

function scopeQuery(query, context) {
  let scoped = query.eq("organization_id", context.organization_id);

  if (context.entity_id) {
    scoped = scoped.or(`entity_id.eq.${context.entity_id},entity_id.is.null`);
  }

  if (context.period_id) {
    scoped = scoped.or(`period_id.eq.${context.period_id},period_id.is.null`);
  }

  return scoped;
}

function capabilitySummary(rows, capabilityIds, now, timezone) {
  return Object.fromEntries(
    capabilityIds.map((capabilityId) => {
      const capabilityRows = rows.filter((row) => row.capability_id === capabilityId);
      const activeRows = capabilityRows.filter((row) => !isTerminal(row.status));
      const states = activeRows.map((row) => actionability(row, now, timezone));

      return [capabilityId, {
        total: capabilityRows.length,
        active: activeRows.length,
        attention: states.filter((state) => state.needs_intervention).length,
        high_priority: states.filter((state) => state.high_priority).length,
        unassigned: states.filter((state) => state.unassigned).length,
        due_today: states.filter((state) => state.due_today).length,
      }];
    }),
  );
}

function compareRankedRows(a, b) {
  const scoreDelta = Number(b.rank_score || 0) - Number(a.rank_score || 0);
  if (scoreDelta) return scoreDelta;

  const aDue = dueTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bDue = dueTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (aDue !== bDue) return aDue - bDue;

  return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
}

function compareTodayRows(a, b) {
  const aTime = new Date(a.scheduled_start || a.due_at || 0).getTime();
  const bTime = new Date(b.scheduled_start || b.due_at || 0).getTime();
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
  return compareRankedRows(a, b);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const input = searchParamsToObject(searchParams);
    const requestedCapabilities = parseCapabilities(
      searchParams.get("capabilities") || searchParams.get("capability_ids"),
    );

    const resolved = await resolveOperationsRequestContext({
      request,
      input,
      authorize: false,
    });

    if (!resolved.success) {
      return NextResponse.json(
        { success: false, error: resolved.error },
        { status: resolved.status || 400 },
      );
    }

    const permissions = resolved.context.permissions || [];
    const capabilityIds = requestedCapabilities.filter((capabilityId) =>
      hasOperationsPermission({
        permissions,
        capabilityId,
        action: OPERATIONS_ACTIONS.VIEW,
      }),
    );

    if (!capabilityIds.length) {
      return NextResponse.json({
        success: true,
        context: resolved.context,
        metrics: {
          active: 0,
          attention: 0,
          overdue: 0,
          due_today: 0,
          due_soon: 0,
          scheduled_today: 0,
          unassigned: 0,
          high_priority: 0,
          completed_today: 0,
        },
        capabilities: {},
        attention: [],
        today: [],
        authorized_capabilities: [],
        generated_at: new Date().toISOString(),
      });
    }

    let query = supabaseAdmin
      .from("operations_records")
      .select(
        "id, capability_id, record_type, code, name, description, status, priority, assigned_to, scheduled_start, scheduled_end, due_at, completed_at, source_domain, source_type, source_id, created_at, updated_at",
      )
      .in("capability_id", capabilityIds)
      .order("updated_at", { ascending: false })
      .limit(1000);

    query = scopeQuery(query, resolved.context);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const now = new Date();
    const timezone = resolved.context.timezone || "UTC";
    const todayKey = localDateKey(now, timezone);
    const activeRows = rows.filter((row) => !isTerminal(row.status));
    const rankedRows = activeRows.map((row) => ({
      ...row,
      ...actionability(row, now, timezone),
    }));

    const attention = rankedRows
      .filter((row) => row.needs_intervention)
      .sort(compareRankedRows)
      .slice(0, 18);

    const today = rankedRows
      .filter((row) => {
        const scheduledToday = localDateKey(row.scheduled_start, timezone) === todayKey;
        const dueToday = localDateKey(row.due_at, timezone) === todayKey;
        return scheduledToday || dueToday;
      })
      .sort(compareTodayRows)
      .slice(0, 24);

    const rowStates = rankedRows.map((row) => row);

    return NextResponse.json({
      success: true,
      context: {
        organization_id: resolved.context.organization_id,
        entity_id: resolved.context.entity_id || null,
        period_id: resolved.context.period_id || null,
        timezone,
      },
      metrics: {
        active: activeRows.length,
        attention: rowStates.filter((row) => row.needs_intervention).length,
        overdue: rowStates.filter((row) => row.overdue).length,
        due_today: rowStates.filter((row) => row.due_today).length,
        due_soon: rowStates.filter((row) => row.due_soon).length,
        scheduled_today: activeRows.filter((row) => localDateKey(row.scheduled_start, timezone) === todayKey).length,
        unassigned: rowStates.filter((row) => row.unassigned).length,
        high_priority: rowStates.filter((row) => row.high_priority).length,
        completed_today: rows.filter((row) => localDateKey(row.completed_at, timezone) === todayKey).length,
      },
      capabilities: capabilitySummary(rows, capabilityIds, now, timezone),
      attention,
      today,
      authorized_capabilities: capabilityIds,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("OPERATIONS_COMMAND_CENTER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load Operations command center",
      },
      { status: 500 },
    );
  }
}
