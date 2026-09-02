export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { planRecurringAccountingCycles } from "@/lib/finance/practice/recurringCyclePlanner";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.configuration.manage"];
const OPEN_ITEM_STATUSES = ["NOT_STARTED", "READY", "IN_PROGRESS", "WAITING_ON_CLIENT", "BLOCKED", "READY_FOR_REVIEW", "CHANGES_REQUESTED"];
const RISK_RANK = { OVERLOADED: 0, HIGH: 1, WATCH: 2, HEALTHY: 3 };
const FORECAST_WINDOWS = [30, 60, 90];

function clean(value) { return String(value ?? "").trim(); }
function jsonError(message, status = 400) { return NextResponse.json({ success: false, error: message }, { status }); }
function dateOnly(value) { return value ? String(value).slice(0, 10) : null; }
function addDays(date, days) { const next = new Date(`${date}T00:00:00.000Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); }
function hours(minutes) { return Math.round((Number(minutes || 0) / 60) * 10) / 10; }
function percent(loadMinutes, availableMinutes) { return availableMinutes > 0 ? Math.round((loadMinutes / availableMinutes) * 1000) / 10 : loadMinutes > 0 ? 9900 : 0; }

async function requireView(access) {
  await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.view", fullAccess: access.permissions?.includes("*") === true });
}

async function requireManage(access) {
  if (access.permissions?.includes("*") === true) return;
  let lastError = null;
  for (const permissionKey of MANAGE_PERMISSIONS) {
    try {
      await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey, fullAccess: false });
      return;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("Finance capacity permission denied");
}

function capacityRisk(loadMinutes, availableMinutes) {
  if (availableMinutes <= 0 && loadMinutes > 0) return "OVERLOADED";
  const ratio = availableMinutes > 0 ? loadMinutes / availableMinutes : 0;
  if (ratio > 1) return "OVERLOADED";
  if (ratio >= 0.85) return "HIGH";
  if (ratio >= 0.65) return "WATCH";
  return "HEALTHY";
}

function emptyLoad() {
  return { minutes: 0, items: 0, overdue: 0, due_7_days: 0, due_14_days: 0, roles: new Set() };
}

function addLoad(target, { minutes, due, today, role }) {
  target.minutes += Math.max(0, Number(minutes || 0));
  target.items += 1;
  if (due && due < today) target.overdue += 1;
  if (due && due <= addDays(today, 7)) target.due_7_days += 1;
  if (due && due <= addDays(today, 14)) target.due_14_days += 1;
  if (target.roles && role) target.roles.add(role);
}

function assignedStaffForRole(profile, role) {
  if (!profile) return null;
  if (role === "PREPARER") return profile.assigned_accountant_id || null;
  if (role === "REVIEWER") return profile.assigned_reviewer_id || null;
  if (role === "PARTNER") return profile.assigned_partner_id || null;
  return null;
}

function summarizeForecastWindow({ days, today, peopleBase, committedItems, forecastItems }) {
  const end = addDays(today, days);
  const weekCount = days / 7;
  const committedByStaff = new Map();
  const forecastByStaff = new Map();
  const unassigned = { committed_minutes: 0, committed_items: 0, forecast_minutes: 0, forecast_items: 0 };
  const clientMap = new Map();
  const roleMap = new Map();

  for (const item of committedItems) {
    const due = dateOnly(item.due_at);
    if (due && due > end) continue;
    const minutes = Math.max(0, Number(item.budget_minutes || 0));
    if (item.assigned_to) committedByStaff.set(item.assigned_to, (committedByStaff.get(item.assigned_to) || 0) + minutes);
    else {
      unassigned.committed_minutes += minutes;
      unassigned.committed_items += 1;
    }
  }

  for (const item of forecastItems) {
    const due = dateOnly(item.due_at);
    if (due && due > end) continue;
    const minutes = Math.max(0, Number(item.budget_minutes || 0));
    if (item.assigned_to) forecastByStaff.set(item.assigned_to, (forecastByStaff.get(item.assigned_to) || 0) + minutes);
    else {
      unassigned.forecast_minutes += minutes;
      unassigned.forecast_items += 1;
    }

    const role = item.required_role || "UNSPECIFIED";
    const roleRow = roleMap.get(role) || { role, forecast_minutes: 0, forecast_items: 0 };
    roleRow.forecast_minutes += minutes;
    roleRow.forecast_items += 1;
    roleMap.set(role, roleRow);

    const clientRow = clientMap.get(item.organization_id) || {
      organization_id: item.organization_id,
      client_name: item.client_name || "Client organization",
      forecast_minutes: 0,
      forecast_items: 0,
      cycles: new Set(),
    };
    clientRow.forecast_minutes += minutes;
    clientRow.forecast_items += 1;
    if (item.idempotency_key) clientRow.cycles.add(item.idempotency_key);
    clientMap.set(item.organization_id, clientRow);
  }

  const people = peopleBase.map((person) => {
    const availableMinutes = Math.round(person.weekly_capacity_minutes * person.utilization_target * weekCount);
    const committedMinutes = committedByStaff.get(person.staff_account_id) || 0;
    const forecastMinutes = forecastByStaff.get(person.staff_account_id) || 0;
    const totalMinutes = committedMinutes + forecastMinutes;
    return {
      staff_account_id: person.staff_account_id,
      name: person.name,
      role: person.role,
      available_hours: hours(availableMinutes),
      committed_hours: hours(committedMinutes),
      forecast_hours: hours(forecastMinutes),
      total_hours: hours(totalMinutes),
      utilization: percent(totalMinutes, availableMinutes),
      committed_utilization: percent(committedMinutes, availableMinutes),
      risk: capacityRisk(totalMinutes, availableMinutes),
      forecast_risk: capacityRisk(totalMinutes, availableMinutes),
      capacity_configured: person.capacity_configured,
    };
  }).sort((a, b) =>
    (RISK_RANK[a.risk] ?? 99) - (RISK_RANK[b.risk] ?? 99) ||
    b.utilization - a.utilization ||
    a.name.localeCompare(b.name)
  );

  const availableMinutes = people.reduce((sum, row) => sum + row.available_hours * 60, 0);
  const committedMinutes = people.reduce((sum, row) => sum + row.committed_hours * 60, 0) + unassigned.committed_minutes;
  const forecastMinutes = people.reduce((sum, row) => sum + row.forecast_hours * 60, 0) + unassigned.forecast_minutes;
  const totalMinutes = committedMinutes + forecastMinutes;

  return {
    days,
    start: today,
    end,
    summary: {
      available_hours: hours(availableMinutes),
      committed_hours: hours(committedMinutes),
      forecast_hours: hours(forecastMinutes),
      total_hours: hours(totalMinutes),
      projected_utilization: percent(totalMinutes, availableMinutes),
      projected_overloaded_people: people.filter((row) => row.risk === "OVERLOADED").length,
      projected_high_load_people: people.filter((row) => ["OVERLOADED", "HIGH"].includes(row.risk)).length,
      unassigned_committed_hours: hours(unassigned.committed_minutes),
      unassigned_forecast_hours: hours(unassigned.forecast_minutes),
      unassigned_forecast_items: unassigned.forecast_items,
    },
    people,
    roles: [...roleMap.values()].map((row) => ({ ...row, forecast_hours: hours(row.forecast_minutes) })).sort((a, b) => b.forecast_minutes - a.forecast_minutes),
    clients: [...clientMap.values()].map((row) => ({
      organization_id: row.organization_id,
      client_name: row.client_name,
      forecast_hours: hours(row.forecast_minutes),
      forecast_items: row.forecast_items,
      cycles: row.cycles.size,
    })).sort((a, b) => b.forecast_hours - a.forecast_hours),
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const horizonDays = Math.min(42, Math.max(7, Number(url.searchParams.get("days") || 14)));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);

    const today = new Date().toISOString().slice(0, 10);
    const horizonEnd = addDays(today, horizonDays);
    const forecastEnd = addDays(today, 90);
    const weekCount = horizonDays / 7;

    const [itemsResult, profilesResult, capacityResult, recurringPlan] = await Promise.all([
      supabaseAdmin.from("accounting_engagement_work_items")
        .select("id,organization_id,entity_id,run_id,title,required_role,assigned_to,status,due_at,budget_minutes,scheduled_start_at,scheduled_end_at")
        .eq("accounting_firm_id", access.organizationId).in("status", OPEN_ITEM_STATUSES).lte("due_at", `${forecastEnd}T23:59:59.999Z`).order("due_at", { ascending: true, nullsFirst: false }).limit(10000),
      supabaseAdmin.from("accounting_client_profiles")
        .select("organization_id,assigned_accountant_id,assigned_accountant_name,assigned_reviewer_id,assigned_reviewer_name,assigned_partner_id,assigned_partner_name")
        .eq("accounting_firm_id", access.organizationId),
      supabaseAdmin.from("accounting_practice_staff_capacity")
        .select("staff_account_id,display_name,primary_role,skill_keys,weekly_capacity_minutes,utilization_target,effective_from,effective_to,status")
        .eq("accounting_firm_id", access.organizationId).eq("status", "ACTIVE").lte("effective_from", forecastEnd),
      planRecurringAccountingCycles({ accountingFirmId: access.organizationId, horizonDays: 90 }),
    ]);
    if (itemsResult.error) throw itemsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (capacityResult.error) throw capacityResult.error;

    const allItems = itemsResult.data || [];
    const items = allItems.filter((item) => !dateOnly(item.due_at) || dateOnly(item.due_at) <= horizonEnd);
    const profiles = profilesResult.data || [];
    const profileMap = new Map(profiles.map((row) => [row.organization_id, row]));
    const explicitCapacities = (capacityResult.data || []).filter((row) => !row.effective_to || row.effective_to >= today);
    const staffIds = new Set();
    for (const profile of profiles) for (const id of [profile.assigned_accountant_id, profile.assigned_reviewer_id, profile.assigned_partner_id]) if (id) staffIds.add(id);
    for (const item of allItems) if (item.assigned_to) staffIds.add(item.assigned_to);
    for (const row of explicitCapacities) if (row.staff_account_id) staffIds.add(row.staff_account_id);

    const forecastItems = [];
    for (const candidate of recurringPlan.candidates || []) {
      if (candidate.status !== "READY_TO_CREATE") continue;
      const profile = profileMap.get(candidate.organization_id);
      for (const step of candidate.forecast?.work_items || []) {
        if (!step.staff_capacity) continue;
        forecastItems.push({
          idempotency_key: candidate.idempotency_key,
          organization_id: candidate.organization_id,
          client_name: candidate.client_name,
          template_id: candidate.template_id,
          run_key: candidate.run_key,
          required_role: step.required_role,
          budget_minutes: step.budget_minutes,
          due_at: step.due_at,
          assigned_to: assignedStaffForRole(profile, step.required_role),
        });
      }
    }

    const { data: staffRows, error: staffError } = staffIds.size
      ? await supabaseAdmin.from("staff_accounts").select("id,name,email,position,role,department,active").in("id", [...staffIds])
      : { data: [], error: null };
    if (staffError) throw staffError;
    const staffMap = new Map((staffRows || []).map((row) => [row.id, row]));
    const capacityMap = new Map();
    for (const row of explicitCapacities) {
      const current = capacityMap.get(row.staff_account_id);
      if (!current || String(row.effective_from) > String(current.effective_from)) capacityMap.set(row.staff_account_id, row);
    }

    const roleHints = new Map();
    const nameHints = new Map();
    for (const profile of profiles) {
      if (profile.assigned_accountant_id) { roleHints.set(profile.assigned_accountant_id, "PREPARER"); if (profile.assigned_accountant_name) nameHints.set(profile.assigned_accountant_id, profile.assigned_accountant_name); }
      if (profile.assigned_reviewer_id) { roleHints.set(profile.assigned_reviewer_id, "REVIEWER"); if (profile.assigned_reviewer_name) nameHints.set(profile.assigned_reviewer_id, profile.assigned_reviewer_name); }
      if (profile.assigned_partner_id) { roleHints.set(profile.assigned_partner_id, "PARTNER"); if (profile.assigned_partner_name) nameHints.set(profile.assigned_partner_id, profile.assigned_partner_name); }
    }

    const loadByStaff = new Map();
    const unassigned = { minutes: 0, items: 0, overdue: 0, due_7_days: 0, due_14_days: 0 };
    for (const item of items) {
      const minutes = Math.max(0, Number(item.budget_minutes || 0));
      const due = dateOnly(item.due_at);
      const target = item.assigned_to ? (loadByStaff.get(item.assigned_to) || emptyLoad()) : unassigned;
      addLoad(target, { minutes, due, today, role: item.required_role });
      if (item.assigned_to) loadByStaff.set(item.assigned_to, target);
    }

    const people = [...staffIds].map((staffId) => {
      const staff = staffMap.get(staffId) || {};
      const capacity = capacityMap.get(staffId) || {};
      const load = loadByStaff.get(staffId) || emptyLoad();
      const weeklyCapacity = Number(capacity.weekly_capacity_minutes ?? 2400);
      const utilizationTarget = Number(capacity.utilization_target ?? 0.85);
      const availableMinutes = Math.round(weeklyCapacity * utilizationTarget * weekCount);
      const ratio = availableMinutes > 0 ? load.minutes / availableMinutes : load.minutes > 0 ? 99 : 0;
      return {
        staff_account_id: staffId,
        name: capacity.display_name || nameHints.get(staffId) || staff.name || staff.email || "Accounting team member",
        role: capacity.primary_role || roleHints.get(staffId) || String(staff.position || staff.role || "PREPARER").toUpperCase(),
        weekly_capacity_minutes: weeklyCapacity,
        weekly_capacity_hours: hours(weeklyCapacity),
        utilization_target: utilizationTarget,
        available_hours: hours(availableMinutes),
        assigned_hours: hours(load.minutes),
        remaining_hours: hours(Math.max(0, availableMinutes - load.minutes)),
        utilization: Math.round(ratio * 1000) / 10,
        risk: capacityRisk(load.minutes, availableMinutes),
        open_items: load.items,
        overdue_items: load.overdue,
        due_7_days: load.due_7_days,
        due_14_days: load.due_14_days,
        assigned_roles: [...load.roles],
        capacity_configured: Boolean(capacity.staff_account_id),
      };
    }).sort((a, b) =>
      (RISK_RANK[a.risk] ?? 99) - (RISK_RANK[b.risk] ?? 99) ||
      b.utilization - a.utilization ||
      a.name.localeCompare(b.name)
    );

    const totalAvailable = people.reduce((sum, row) => sum + row.available_hours, 0);
    const totalAssigned = people.reduce((sum, row) => sum + row.assigned_hours, 0);
    const totalCapacityMinutes = people.reduce((sum, row) => sum + row.weekly_capacity_hours * 60 * row.utilization_target * weekCount, 0);
    const roleSummary = {};
    for (const person of people) {
      const role = person.role || "UNSPECIFIED";
      if (!roleSummary[role]) roleSummary[role] = { people: 0, assigned_hours: 0, available_hours: 0, overloaded: 0 };
      roleSummary[role].people += 1;
      roleSummary[role].assigned_hours += person.assigned_hours;
      roleSummary[role].available_hours += person.available_hours;
      if (person.risk === "OVERLOADED") roleSummary[role].overloaded += 1;
    }

    const peopleBase = people.map((person) => ({
      staff_account_id: person.staff_account_id,
      name: person.name,
      role: person.role,
      weekly_capacity_minutes: person.weekly_capacity_minutes,
      utilization_target: person.utilization_target,
      capacity_configured: person.capacity_configured,
    }));
    const forecastWindows = Object.fromEntries(FORECAST_WINDOWS.map((days) => [
      String(days),
      summarizeForecastWindow({ days, today, peopleBase, committedItems: allItems, forecastItems }),
    ]));

    return NextResponse.json({
      success: true,
      horizon: { start: today, end: horizonEnd, days: horizonDays },
      summary: {
        people: people.length,
        assigned_hours: Math.round(totalAssigned * 10) / 10,
        available_hours: Math.round(totalAvailable * 10) / 10,
        utilization: totalCapacityMinutes > 0 ? Math.round((items.reduce((sum, row) => sum + Number(row.budget_minutes || 0), 0) / totalCapacityMinutes) * 1000) / 10 : 0,
        overloaded_people: people.filter((row) => row.risk === "OVERLOADED").length,
        high_load_people: people.filter((row) => ["OVERLOADED", "HIGH"].includes(row.risk)).length,
        unassigned_hours: hours(unassigned.minutes),
        unassigned_items: unassigned.items,
        overdue_items: items.filter((row) => dateOnly(row.due_at) && dateOnly(row.due_at) < today).length,
      },
      roles: roleSummary,
      people,
      forecast: {
        source: "governed_recurring_plan",
        materialized: false,
        ready_cycles: (recurringPlan.candidates || []).filter((candidate) => candidate.status === "READY_TO_CREATE").length,
        blocked_cycles: (recurringPlan.candidates || []).filter((candidate) => !["READY_TO_CREATE", "ALREADY_EXISTS"].includes(candidate.status)).length,
        staff_budget_hours: hours(forecastItems.reduce((sum, row) => sum + Number(row.budget_minutes || 0), 0)),
        windows: forecastWindows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error?.message || "Unable to load accounting practice capacity";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const staffAccountId = clean(body.staffAccountId || body.staff_account_id);
    if (!staffAccountId) return jsonError("staffAccountId is required");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const weeklyCapacityMinutes = Math.max(0, Math.min(10080, Number(body.weeklyCapacityMinutes ?? body.weekly_capacity_minutes ?? 2400)));
    const utilizationTarget = Math.max(0.1, Math.min(1, Number(body.utilizationTarget ?? body.utilization_target ?? 0.85)));
    const effectiveFrom = clean(body.effectiveFrom || body.effective_from) || new Date().toISOString().slice(0, 10);
    const primaryRole = clean(body.primaryRole || body.primary_role || "PREPARER").toUpperCase();
    if (!["PREPARER", "REVIEWER", "PARTNER", "MANAGER", "ADMIN"].includes(primaryRole)) return jsonError("Invalid primaryRole");

    const { data: staff, error: staffError } = await supabaseAdmin.from("staff_accounts").select("id,name,email").eq("id", staffAccountId).eq("active_organization_id", access.organizationId).maybeSingle();
    if (staffError) throw staffError;
    const { data: membership, error: membershipError } = await supabaseAdmin.from("organization_users").select("id").eq("organization_id", access.organizationId).eq("staff_account_id", staffAccountId).eq("status", "active").maybeSingle();
    if (membershipError) throw membershipError;
    if (!staff && !membership) return jsonError("Staff member is not active in this accounting firm", 409);

    const { data, error } = await supabaseAdmin.from("accounting_practice_staff_capacity").upsert({
      accounting_firm_id: access.organizationId,
      staff_account_id: staffAccountId,
      display_name: clean(body.displayName || body.display_name) || staff?.name || staff?.email || null,
      primary_role: primaryRole,
      skill_keys: Array.isArray(body.skillKeys || body.skill_keys) ? (body.skillKeys || body.skill_keys) : [],
      weekly_capacity_minutes: weeklyCapacityMinutes,
      utilization_target: utilizationTarget,
      effective_from: effectiveFrom,
      effective_to: body.effectiveTo || body.effective_to || null,
      status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      created_by: access.user?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "accounting_firm_id,staff_account_id,effective_from" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ success: true, capacity: data });
  } catch (error) {
    const message = error?.message || "Unable to save accounting practice capacity";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
