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

function dateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function priorityScore(row, now) {
  const due = row?.due_at ? new Date(row.due_at) : null;
  const overdue = due && !Number.isNaN(due.getTime()) && due < now && !isTerminal(row.status);
  const dueToday = due && dateKey(due) === dateKey(now) && !isTerminal(row.status);

  return (
    (overdue ? 1000 : 0) +
    (isHighPriority(row.priority) ? 500 : 0) +
    (!row.assigned_to && !isTerminal(row.status) ? 200 : 0) +
    (dueToday ? 100 : 0)
  );
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

function capabilitySummary(rows, capabilityIds) {
  return Object.fromEntries(
    capabilityIds.map((capabilityId) => {
      const capabilityRows = rows.filter((row) => row.capability_id === capabilityId);
      const activeRows = capabilityRows.filter((row) => !isTerminal(row.status));

      return [capabilityId, {
        total: capabilityRows.length,
        active: activeRows.length,
        high_priority: activeRows.filter((row) => isHighPriority(row.priority)).length,
        unassigned: activeRows.filter((row) => !row.assigned_to).length,
      }];
    }),
  );
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
          overdue: 0,
          due_today: 0,
          unassigned: 0,
          high_priority: 0,
          completed_today: 0,
        },
        capabilities: {},
        attention: [],
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
    const today = dateKey(now);
    const activeRows = rows.filter((row) => !isTerminal(row.status));

    const attention = [...activeRows]
      .sort((a, b) => {
        const scoreDelta = priorityScore(b, now) - priorityScore(a, now);
        if (scoreDelta) return scoreDelta;

        const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDue !== bDue) return aDue - bDue;

        return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
      })
      .slice(0, 18)
      .map((row) => ({
        ...row,
        overdue: Boolean(
          row.due_at &&
          new Date(row.due_at) < now &&
          !isTerminal(row.status)
        ),
        high_priority: isHighPriority(row.priority),
      }));

    return NextResponse.json({
      success: true,
      context: {
        organization_id: resolved.context.organization_id,
        entity_id: resolved.context.entity_id || null,
        period_id: resolved.context.period_id || null,
      },
      metrics: {
        active: activeRows.length,
        overdue: activeRows.filter((row) => row.due_at && new Date(row.due_at) < now).length,
        due_today: activeRows.filter((row) => dateKey(row.due_at) === today).length,
        unassigned: activeRows.filter((row) => !row.assigned_to).length,
        high_priority: activeRows.filter((row) => isHighPriority(row.priority)).length,
        completed_today: rows.filter((row) => dateKey(row.completed_at) === today).length,
      },
      capabilities: capabilitySummary(rows, capabilityIds),
      attention,
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
