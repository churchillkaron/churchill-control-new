export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.configuration.manage"];
const OPEN_ITEM_STATUSES = ["NOT_STARTED", "READY", "IN_PROGRESS", "WAITING_ON_CLIENT", "BLOCKED", "READY_FOR_REVIEW", "CHANGES_REQUESTED"];

function clean(value) { return String(value ?? "").trim(); }
function jsonError(error, status = 400) { return NextResponse.json({ success: false, error }, { status }); }
function money(value) { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function hours(minutes) { return Math.round((Number(minutes || 0) / 60) * 100) / 100; }

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
  throw lastError || new Error("Finance practice time permission denied");
}
function staffId(access) {
  return access?.access?.staffAccountId || access?.staff?.id || null;
}

async function loadContext(accountingFirmId) {
  const [engagementsResult, organizationsResult, profilesResult, itemsResult, billingResult] = await Promise.all([
    supabaseAdmin.from("accounting_engagements")
      .select("id,organization_id,entity_id,service_package,status")
      .eq("accounting_firm_id", accountingFirmId).order("created_at", { ascending: true }).limit(1000),
    supabaseAdmin.from("organizations").select("id,name").limit(5000),
    supabaseAdmin.from("accounting_client_profiles")
      .select("organization_id,assigned_accountant_id,assigned_accountant_name,assigned_reviewer_id,assigned_reviewer_name,assigned_partner_id,assigned_partner_name")
      .eq("accounting_firm_id", accountingFirmId),
    supabaseAdmin.from("accounting_engagement_work_items")
      .select("id,organization_id,entity_id,run_id,title,status,assigned_to,budget_minutes,due_at")
      .eq("accounting_firm_id", accountingFirmId).in("status", OPEN_ITEM_STATUSES).order("due_at", { ascending: true, nullsFirst: false }).limit(10000),
    supabaseAdmin.from("accounting_practice_billing_profiles")
      .select("id,organization_id,engagement_id,billing_method,currency_code,default_hourly_rate,fixed_fee_amount,status,updated_at")
      .eq("accounting_firm_id", accountingFirmId),
  ]);
  for (const result of [engagementsResult, organizationsResult, profilesResult, itemsResult, billingResult]) if (result.error) throw result.error;
  return {
    engagements: engagementsResult.data || [], organizations: organizationsResult.data || [], profiles: profilesResult.data || [],
    workItems: itemsResult.data || [], billingProfiles: billingResult.data || [],
  };
}

function buildSummary({ context, entries }) {
  const orgNames = new Map(context.organizations.map((row) => [row.id, row.name || "Client organization"]));
  const engagementById = new Map(context.engagements.map((row) => [row.id, row]));
  const billingByEngagement = new Map(context.billingProfiles.map((row) => [row.engagement_id, row]));
  const workItemById = new Map(context.workItems.map((row) => [row.id, row]));
  const clientMap = new Map();
  let totalMinutes = 0, billableMinutes = 0, unbilledValue = 0, unpricedMinutes = 0, approvedUnbilledMinutes = 0;

  for (const entry of entries) {
    if (entry.status === "VOID") continue;
    totalMinutes += Number(entry.minutes || 0);
    if (entry.billable) billableMinutes += Number(entry.minutes || 0);
    const isUnbilled = entry.billable && entry.status !== "BILLED";
    const pricedValue = isUnbilled && entry.billing_rate != null ? Number(entry.billing_rate || 0) * Number(entry.minutes || 0) / 60 : 0;
    if (isUnbilled && entry.billing_rate == null) unpricedMinutes += Number(entry.minutes || 0);
    if (isUnbilled && entry.status === "APPROVED") approvedUnbilledMinutes += Number(entry.minutes || 0);
    unbilledValue += pricedValue;
    const client = clientMap.get(entry.organization_id) || {
      organization_id: entry.organization_id,
      client_name: orgNames.get(entry.organization_id) || "Client organization",
      minutes: 0, billable_minutes: 0, approved_unbilled_minutes: 0, unbilled_value: 0, unpriced_minutes: 0, entries: 0,
    };
    client.minutes += Number(entry.minutes || 0);
    client.entries += 1;
    if (entry.billable) client.billable_minutes += Number(entry.minutes || 0);
    if (isUnbilled && entry.status === "APPROVED") client.approved_unbilled_minutes += Number(entry.minutes || 0);
    if (isUnbilled && entry.billing_rate == null) client.unpriced_minutes += Number(entry.minutes || 0);
    client.unbilled_value += pricedValue;
    clientMap.set(entry.organization_id, client);
  }

  const workItems = context.workItems.map((item) => {
    const actual = entries.filter((entry) => entry.work_item_id === item.id && entry.status !== "VOID").reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);
    return {
      ...item,
      client_name: orgNames.get(item.organization_id) || "Client organization",
      actual_minutes: actual,
      budget_variance_minutes: actual - Number(item.budget_minutes || 0),
    };
  });

  const clients = [...clientMap.values()].map((row) => ({
    ...row,
    hours: hours(row.minutes), billable_hours: hours(row.billable_minutes), approved_unbilled_hours: hours(row.approved_unbilled_minutes),
    unpriced_hours: hours(row.unpriced_minutes), unbilled_value: money(row.unbilled_value),
    billing_ready: row.approved_unbilled_minutes > 0 && row.unpriced_minutes === 0,
  })).sort((a, b) => b.unbilled_value - a.unbilled_value || b.billable_minutes - a.billable_minutes || a.client_name.localeCompare(b.client_name));

  return {
    totals: {
      hours: hours(totalMinutes), billable_hours: hours(billableMinutes), approved_unbilled_hours: hours(approvedUnbilledMinutes),
      unpriced_hours: hours(unpricedMinutes), unbilled_value: money(unbilledValue),
      utilization: totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 1000) / 10 : 0,
    },
    clients,
    work_items: workItems,
    billing_profiles: context.billingProfiles,
    engagement_context: context.engagements.map((engagement) => ({
      ...engagement,
      client_name: orgNames.get(engagement.organization_id) || "Client organization",
      billing_profile: billingByEngagement.get(engagement.id) || null,
    })),
    references: { engagementById: engagementById.size, workItemById: workItemById.size },
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);
    const [context, entriesResult] = await Promise.all([
      loadContext(access.organizationId),
      supabaseAdmin.from("accounting_practice_time_entries")
        .select("id,organization_id,entity_id,engagement_id,run_id,work_item_id,staff_account_id,work_date,minutes,billable,billing_rate,currency_code,description,status,approved_by,approved_at,billing_reference,billed_at,created_at,updated_at")
        .eq("accounting_firm_id", access.organizationId).order("work_date", { ascending: false }).order("created_at", { ascending: false }).limit(10000),
    ]);
    if (entriesResult.error) throw entriesResult.error;
    const entries = entriesResult.data || [];
    return NextResponse.json({ success: true, ...buildSummary({ context, entries }), entries, viewer_staff_account_id: staffId(access), generated_at: new Date().toISOString() });
  } catch (error) {
    return jsonError(error?.message || "Unable to load practice time and WIP", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);
    const actorStaffId = staffId(access);
    if (!actorStaffId) return jsonError("A linked staff account is required to record accounting time", 409);

    if (body.action === "upsert_billing_profile") {
      await requireManage(access);
      const engagementId = clean(body.engagementId || body.engagement_id);
      const { data: engagement, error: engagementError } = await supabaseAdmin.from("accounting_engagements")
        .select("id,organization_id").eq("id", engagementId).eq("accounting_firm_id", access.organizationId).maybeSingle();
      if (engagementError) throw engagementError;
      if (!engagement) return jsonError("Accounting engagement not found", 404);
      const billingMethod = clean(body.billingMethod || body.billing_method || "TIME_AND_MATERIALS").toUpperCase();
      if (!["TIME_AND_MATERIALS","FIXED_FEE","HYBRID","NON_BILLABLE"].includes(billingMethod)) return jsonError("Unsupported billing method", 400);
      const hourlyRate = body.defaultHourlyRate == null && body.default_hourly_rate == null ? null : Number(body.defaultHourlyRate ?? body.default_hourly_rate);
      const fixedFee = body.fixedFeeAmount == null && body.fixed_fee_amount == null ? null : Number(body.fixedFeeAmount ?? body.fixed_fee_amount);
      if (hourlyRate != null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) return jsonError("Hourly rate must be zero or greater", 400);
      if (fixedFee != null && (!Number.isFinite(fixedFee) || fixedFee < 0)) return jsonError("Fixed fee must be zero or greater", 400);
      const { data, error } = await supabaseAdmin.from("accounting_practice_billing_profiles").upsert({
        accounting_firm_id: access.organizationId, organization_id: engagement.organization_id, engagement_id: engagement.id,
        billing_method: billingMethod, currency_code: clean(body.currencyCode || body.currency_code || "THB").toUpperCase(),
        default_hourly_rate: hourlyRate, fixed_fee_amount: fixedFee, status: "ACTIVE", updated_by: actorStaffId, updated_at: new Date().toISOString(),
      }, { onConflict: "accounting_firm_id,engagement_id" }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ success: true, billing_profile: data });
    }

    const workItemId = clean(body.workItemId || body.work_item_id);
    const minutes = Math.round(Number(body.minutes || 0));
    if (!workItemId) return jsonError("Work item is required", 400);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return jsonError("Time must be between 1 and 1440 minutes", 400);
    const { data: item, error: itemError } = await supabaseAdmin.from("accounting_engagement_work_items")
      .select("id,organization_id,entity_id,run_id,assigned_to,title").eq("id", workItemId).eq("accounting_firm_id", access.organizationId).maybeSingle();
    if (itemError) throw itemError;
    if (!item) return jsonError("Accounting work item not found", 404);
    const { data: run, error: runError } = await supabaseAdmin.from("accounting_engagement_runs")
      .select("id,engagement_id").eq("id", item.run_id).eq("accounting_firm_id", access.organizationId).maybeSingle();
    if (runError) throw runError;
    if (!run) return jsonError("Accounting run not found", 409);
    const { data: billingProfile, error: profileError } = await supabaseAdmin.from("accounting_practice_billing_profiles")
      .select("billing_method,currency_code,default_hourly_rate,status").eq("accounting_firm_id", access.organizationId).eq("engagement_id", run.engagement_id).eq("status", "ACTIVE").maybeSingle();
    if (profileError) throw profileError;
    const billable = body.billable !== false && billingProfile?.billing_method !== "NON_BILLABLE";
    const rate = billable && billingProfile?.default_hourly_rate != null ? Number(billingProfile.default_hourly_rate) : null;
    const { data, error } = await supabaseAdmin.from("accounting_practice_time_entries").insert({
      accounting_firm_id: access.organizationId, organization_id: item.organization_id, entity_id: item.entity_id,
      engagement_id: run.engagement_id, run_id: item.run_id, work_item_id: item.id, staff_account_id: actorStaffId,
      work_date: clean(body.workDate || body.work_date || new Date().toISOString().slice(0, 10)), minutes, billable,
      billing_rate: rate, currency_code: clean(billingProfile?.currency_code || "THB").toUpperCase(), description: clean(body.description) || null,
      status: "SUBMITTED", metadata: { source: "finance_practice_time", work_item_title: item.title },
    }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ success: true, time_entry: data }, { status: 201 });
  } catch (error) {
    return jsonError(error?.message || "Unable to record practice time", 500);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);
    const actorStaffId = staffId(access);
    if (!actorStaffId) return jsonError("A linked staff account is required", 409);
    const entryId = clean(body.entryId || body.entry_id);
    const action = clean(body.action).toLowerCase();
    const { data: current, error: currentError } = await supabaseAdmin.from("accounting_practice_time_entries")
      .select("*").eq("id", entryId).eq("accounting_firm_id", access.organizationId).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return jsonError("Time entry not found", 404);
    if (action === "approve") {
      if (!["DRAFT","SUBMITTED"].includes(current.status)) return jsonError("Only draft or submitted time can be approved", 409);
      const { data, error } = await supabaseAdmin.from("accounting_practice_time_entries").update({ status: "APPROVED", approved_by: actorStaffId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", current.id).eq("accounting_firm_id", access.organizationId).select("*").single();
      if (error) throw error;
      return NextResponse.json({ success: true, time_entry: data });
    }
    if (action === "void") {
      if (current.status === "BILLED") return jsonError("Billed time cannot be voided; use the governed billing correction flow", 409);
      const { data, error } = await supabaseAdmin.from("accounting_practice_time_entries").update({ status: "VOID", updated_at: new Date().toISOString() }).eq("id", current.id).eq("accounting_firm_id", access.organizationId).select("*").single();
      if (error) throw error;
      return NextResponse.json({ success: true, time_entry: data });
    }
    return jsonError("Unsupported time-entry action", 400);
  } catch (error) {
    return jsonError(error?.message || "Unable to update practice time", 500);
  }
}
