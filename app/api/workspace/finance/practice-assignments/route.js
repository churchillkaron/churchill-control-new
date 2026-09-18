export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { loadCompletePracticeRows, loadCompletePracticeRowsByIds } from "@/lib/finance/practice/FinancePracticePopulation";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.configuration.manage"];

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function requireView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

async function requireManage(access) {
  if (access.permissions?.includes("*") === true) return;
  let lastError = null;
  for (const permissionKey of MANAGE_PERMISSIONS) {
    try {
      await checkFinancePermission({
        organizationId: access.organizationId,
        userId: access.user?.id,
        permissionKey,
        fullAccess: false,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Finance client staffing permission denied");
}

async function loadEngagement(access, engagementId) {
  if (!engagementId) throw new Error("engagementId is required");
  const { data, error } = await supabaseAdmin
    .from("accounting_engagements")
    .select("id,organization_id,status")
    .eq("id", engagementId)
    .eq("accounting_firm_id", access.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const error = new Error("Accounting engagement not found for this firm");
    error.status = 404;
    throw error;
  }
  return data;
}

async function loadStaffOptions(accountingFirmId) {
  const memberships = await loadCompletePracticeRows({
    label: "Accounting practice active staff memberships",
    buildQuery: (from, to) => supabaseAdmin.from("organization_users")
      .select("staff_account_id,status")
      .eq("organization_id", accountingFirmId)
      .eq("status", "active")
      .order("staff_account_id", { ascending: true })
      .range(from, to),
  });
  const staffIds = [...new Set(memberships.map((row) => row.staff_account_id).filter(Boolean))];
  if (!staffIds.length) return [];
  const staff = await loadCompletePracticeRowsByIds({
    ids: staffIds,
    label: "Accounting practice active staff accounts",
    buildQuery: (batch, from, to) => supabaseAdmin.from("staff_accounts")
      .select("id,name,email,position,role,department,active")
      .in("id", batch)
      .eq("active", true)
      .order("name", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  });
  return staff.map((row) => ({
    id: row.id,
    name: row.name || row.email || "Accounting team member",
    email: row.email || null,
    position: row.position || row.role || null,
    department: row.department || null,
  }));
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const engagementId = clean(url.searchParams.get("engagementId") || url.searchParams.get("engagement_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);
    const engagement = await loadEngagement(access, engagementId);

    const [{ data: profile, error: profileError }, staff] = await Promise.all([
      supabaseAdmin.from("accounting_client_profiles")
        .select("id,organization_id,assigned_accountant_id,assigned_accountant_name,assigned_reviewer_id,assigned_reviewer_name,assigned_partner_id,assigned_partner_name,status")
        .eq("accounting_firm_id", access.organizationId)
        .eq("organization_id", engagement.organization_id)
        .maybeSingle(),
      loadStaffOptions(access.organizationId),
    ]);
    if (profileError) throw profileError;
    if (!profile) return jsonError("Accounting client profile not found", 404);
    return NextResponse.json({
      success: true,
      engagement_id: engagement.id,
      client_organization_id: engagement.organization_id,
      profile,
      staff,
      segregation_of_duties: {
        roles: ["PREPARER", "REVIEWER", "PARTNER"],
        distinct_people_required: true,
      },
    });
  } catch (error) {
    const message = error?.message || "Unable to load accounting client staffing";
    return jsonError(message, error?.status || (/permission denied/i.test(message) ? 403 : 500));
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const engagementId = clean(body.engagementId || body.engagement_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);
    await loadEngagement(access, engagementId);

    const assignedAccountantId = clean(body.assignedAccountantId || body.assigned_accountant_id) || null;
    const assignedReviewerId = clean(body.assignedReviewerId || body.assigned_reviewer_id) || null;
    const assignedPartnerId = clean(body.assignedPartnerId || body.assigned_partner_id) || null;

    const { data, error } = await supabaseAdmin.rpc("accounting_update_client_staff_assignments", {
      p_accounting_firm_id: access.organizationId,
      p_engagement_id: engagementId,
      p_accountant_id: assignedAccountantId,
      p_reviewer_id: assignedReviewerId,
      p_partner_id: assignedPartnerId,
      p_actor: access.user?.id || null,
    });
    if (error) {
      if (/function .* does not exist|schema cache/i.test(error.message || "")) {
        return jsonError("Accounting staffing migration is not installed in this environment", 503);
      }
      throw error;
    }
    return NextResponse.json({ success: true, assignment: data });
  } catch (error) {
    const message = error?.message || "Unable to save accounting client staffing";
    const status = error?.status || (/permission denied/i.test(message) ? 403 : /ASSIGNMENT|SEGREGATION|ACTIVE_FIRM_MEMBER|REQUIRED|UNAVAILABLE/i.test(message) ? 409 : 500);
    return jsonError(message, status);
  }
}
