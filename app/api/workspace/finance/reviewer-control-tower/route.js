export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";
import { buildFinanceReviewerControlTower } from "@/lib/finance/practice/FinanceReviewerControlTowerRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_ENGAGEMENT_STATUSES = ["active", "ACTIVE", "enabled", "ENABLED"];
const OPEN_RUN_STATUSES = ["PLANNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "READY_FOR_REVIEW", "REVIEWED", "CLEARED", "BLOCKED"];
const OPEN_WORK_ITEM_STATUSES = ["NOT_STARTED", "READY", "IN_PROGRESS", "WAITING_ON_CLIENT", "BLOCKED", "READY_FOR_REVIEW", "CHANGES_REQUESTED"];
const OPEN_CLIENT_REQUEST_STATUSES = ["DRAFT", "SENT", "VIEWED", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED"];
const ORGANIZATION_BATCH_SIZE = 100;

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json(
    { success: false, error: message, ...(details ? { details } : {}) },
    { status },
  );
}

async function requireView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

function viewerFromAccess(access) {
  return {
    staff_account_id: access?.access?.staffAccountId || access?.staff?.id || null,
    name: access?.staff?.name || access?.staff?.display_name || access?.staff?.email || access?.user?.email || "Accounting team member",
    email: access?.staff?.email || access?.user?.email || null,
    role: access?.access?.role || access?.role || access?.staff?.role || null,
  };
}

async function loadOrganizations(organizationIds) {
  const ids = [...new Set((organizationIds || []).filter(Boolean))];
  const rows = [];
  for (let index = 0; index < ids.length; index += ORGANIZATION_BATCH_SIZE) {
    const batch = ids.slice(index, index + ORGANIZATION_BATCH_SIZE);
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id,name")
      .in("id", batch)
      .order("id", { ascending: true });
    if (error) throw error;
    rows.push(...(data || []));
  }
  return {
    rows,
    complete: true,
    batches: Math.ceil(ids.length / ORGANIZATION_BATCH_SIZE),
    requested: ids.length,
    returned: rows.length,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);

    const [engagementPopulation, profilePopulation, runPopulation, workItemPopulation, requestPopulation] = await Promise.all([
      fetchCompleteFinancePopulation({
        label: "Accounting reviewer active engagements",
        buildQuery: (from, to) => supabaseAdmin
          .from("accounting_engagements")
          .select("id,organization_id,entity_id,service_package,status,year_end_date,renewal_date,created_at")
          .eq("accounting_firm_id", access.organizationId)
          .in("status", ACTIVE_ENGAGEMENT_STATUSES)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      }),
      fetchCompleteFinancePopulation({
        label: "Accounting reviewer client profiles",
        buildQuery: (from, to) => supabaseAdmin
          .from("accounting_client_profiles")
          .select("id,organization_id,assigned_accountant_id,assigned_accountant_name,assigned_reviewer_id,assigned_reviewer_name,assigned_partner_id,assigned_partner_name,status,created_at")
          .eq("accounting_firm_id", access.organizationId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      }),
      fetchCompleteFinancePopulation({
        label: "Accounting reviewer open runs",
        buildQuery: (from, to) => supabaseAdmin
          .from("accounting_engagement_runs")
          .select("id,organization_id,entity_id,engagement_id,template_id,period_id,run_key,cadence,status,start_at,due_at,created_at,updated_at")
          .eq("accounting_firm_id", access.organizationId)
          .in("status", OPEN_RUN_STATUSES)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      }),
      fetchCompleteFinancePopulation({
        label: "Accounting reviewer open work items",
        buildQuery: (from, to) => supabaseAdmin
          .from("accounting_engagement_work_items")
          .select("id,organization_id,entity_id,run_id,step_key,sequence_no,title,work_type,required_role,assigned_to,status,due_at,blocked_reason,capability_id,finance_review_item_id,evidence,conclusion,metadata,budget_minutes,created_at,updated_at")
          .eq("accounting_firm_id", access.organizationId)
          .in("status", OPEN_WORK_ITEM_STATUSES)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      }),
      fetchCompleteFinancePopulation({
        label: "Accounting reviewer open client requests",
        buildQuery: (from, to) => supabaseAdmin
          .from("accounting_client_requests")
          .select("id,organization_id,entity_id,run_id,work_item_id,title,status,due_at,sent_at,submitted_at,created_at,updated_at")
          .eq("accounting_firm_id", access.organizationId)
          .in("status", OPEN_CLIENT_REQUEST_STATUSES)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      }),
    ]);

    const activeClientIds = [...new Set(engagementPopulation.rows.map((row) => row.organization_id).filter(Boolean))];
    const organizationPopulation = await loadOrganizations(activeClientIds);
    const generatedAt = new Date().toISOString();
    const sources = {
      engagements: engagementPopulation,
      profiles: profilePopulation,
      runs: runPopulation,
      work_items: workItemPopulation,
      client_requests: requestPopulation,
      organizations: organizationPopulation,
    };

    const tower = buildFinanceReviewerControlTower({
      engagements: engagementPopulation.rows,
      profiles: profilePopulation.rows,
      runs: runPopulation.rows,
      workItems: workItemPopulation.rows,
      clientRequests: requestPopulation.rows,
      organizations: organizationPopulation.rows,
      viewer: viewerFromAccess(access),
      generatedAt,
      sources,
    });

    if (tower.integrity?.complete !== true) {
      return jsonError("Reviewer control tower population completeness could not be proven", 503, tower.integrity);
    }

    return NextResponse.json({ success: true, ...tower });
  } catch (error) {
    const message = error?.message || "Unable to load Finance reviewer control tower";
    const status = /permission denied/i.test(message)
      ? 403
      : /completeness boundary|silently truncated/i.test(message)
        ? 503
        : 500;
    return jsonError(message, status);
  }
}
