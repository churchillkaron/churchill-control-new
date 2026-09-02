export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.configuration.manage"];
const OPEN_ITEM_STATUSES = ["NOT_STARTED", "READY", "IN_PROGRESS", "WAITING_ON_CLIENT", "BLOCKED", "READY_FOR_REVIEW", "CHANGES_REQUESTED"];
const RISK_RANK = { OVERLOADED: 0, HIGH: 1, WATCH: 2, HEALTHY: 3 };

function clean(value) { return String(value ?? "").trim(); }
function jsonError(message, status = 400) { return NextResponse.json({ success: false, error: message }, { status }); }
function dateOnly(value) { return value ? String(value).slice(0, 10) : null; }
function addDays(date, days) { const next = new Date(`${date}T00:00:00.000Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); }
function hours(minutes) { return Math.round((Number(minutes || 0) / 60) * 10) / 10; }

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
    const weekCount = horizonDays / 7;

    const [itemsResult, profilesResult, capacityResult] = await Promise.all([
      supabaseAdmin.from("accounting_engagement_work_items")
        .select("id,organization_id,entity_id,run_id,title,required_role,assigned_to,status,due_at,budget_minutes,scheduled_start_at,scheduled_end_at")
        .eq("accounting_firm_id", access.organizationId).in("status", OPEN_ITEM_STATUSES).lte("due_at", `${horizonEnd}T23:59:59.999Z`).order("due_at", { ascending: true, nullsFirst: false }).limit(10000),
      supabaseAdmin.from("accounting_client_profiles")
        .select("organization_id,assigned_accountant_id,assigned_accountant_name,assigned_reviewer_id,assigned_reviewer_name,assigned_partner_id,assigned_partner_name")
        .eq("accounting_firm_id", access.organizationId),
      supabaseAdmin.from("accounting_practice_staff_capacity")
        .select("staff_account_id,display_name,primary_role,skill_keys,weekly_capacity_minutes,utilization_target,effective_from,effective_to,status")
        .eq("accounting_firm_id", access.organizationId).eq("status", "ACTIVE").lte("effective_from", horizonEnd),
    ]);
    if (itemsResult.error) throw itemsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (capacityResult.error) throw capacityResult.error;

    const items = itemsResult.data || [];
    const profiles = profilesResult.data || [];
    const explicitCapacities = (capacityResult.data || []).filter((row) => !row.effective_to || row.effective_to >= today);
    const staffIds = new Set();
    for (const profile of profiles) for (const id of [profile.assigned_accountant_id, profile.assigned_reviewer_id, profile.assigned_partner_id]) if (id) staffIds.add(id);
    for (const item of items) if (item.assigned_to) staffIds.add(item.assigned_to);
    for (const row of explicitCapacities) if (row.staff_account_id) staffIds.add(row.staff_account_id);

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
      const target = item.assigned_to ? (loadByStaff.get(item.assigned_to) || { minutes: 0, items: 0, overdue: 0, due_7_days: 0, due_14_days: 0, roles: new Set() }) : unassigned;
      target.minutes += minutes;
      target.items += 1;
      if (due && due < today) target.overdue += 1;
      if (due && due <= addDays(today, 7)) target.due_7_days += 1;
      if (due && due <= addDays(today, 14)) target.due_14_days += 1;
      if (target.roles) target.roles.add(item.required_role);
      if (item.assigned_to) loadByStaff.set(item.assigned_to, target);
    }

    const people = [...staffIds].map((staffId) => {
      const staff = staffMap.get(staffId) || {};
      const capacity = capacityMap.get(staffId) || {};
      const load = loadByStaff.get(staffId) || { minutes: 0, items: 0, overdue: 0, due_7_days: 0, due_14_days: 0, roles: new Set() };
      const weeklyCapacity = Number(capacity.weekly_capacity_minutes ?? 2400);
      const utilizationTarget = Number(capacity.utilization_target ?? 0.85);
      const availableMinutes = Math.round(weeklyCapacity * utilizationTarget * weekCount);
      const ratio = availableMinutes > 0 ? load.minutes / availableMinutes : load.minutes > 0 ? 99 : 0;
      return {
        staff_account_id: staffId,
        name: capacity.display_name || nameHints.get(staffId) || staff.name || staff.email || "Accounting team member",
        role: capacity.primary_role || roleHints.get(staffId) || String(staff.position || staff.role || "PREPARER").toUpperCase(),
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
