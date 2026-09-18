export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadCompletePracticeRows, loadCompletePracticeRowsByIds } from "@/lib/finance/practice/FinancePracticePopulation";

function clean(value) { return String(value ?? "").trim(); }
function jsonError(message, status = 400, extra = {}) { return NextResponse.json({ success: false, error: message, ...extra }, { status }); }

async function requireView(access) {
  await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.view", fullAccess: access.permissions?.includes("*") === true });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const engagementId = clean(searchParams.get("engagementId") || searchParams.get("engagement_id"));
    const runId = clean(searchParams.get("runId") || searchParams.get("run_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);

    const templateQuery = supabaseAdmin.from("accounting_work_program_templates")
      .select("id,organization_id,template_key,name,description,service_key,cadence,version,is_system,metadata")
      .eq("status", "ACTIVE").or(`organization_id.is.null,organization_id.eq.${access.organizationId}`)
      .order("is_system", { ascending: false }).order("name", { ascending: true });

    const [templatesResult, runs] = await Promise.all([
      templateQuery,
      loadCompletePracticeRows({
        label: "Accounting practice work-program runs",
        buildQuery: (from, to) => {
          let query = supabaseAdmin.from("accounting_engagement_runs")
            .select("id,organization_id,entity_id,engagement_id,template_id,period_id,run_key,cadence,status,start_at,due_at,completed_at,rolled_from_run_id,created_at,updated_at")
            .eq("accounting_firm_id", access.organizationId)
            .order("due_at", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: false })
            .order("id", { ascending: true });
          if (engagementId) query = query.eq("engagement_id", engagementId);
          if (runId) query = query.eq("id", runId);
          return query.range(from, to);
        },
      }),
    ]);
    if (templatesResult.error) throw templatesResult.error;
    const templates = templatesResult.data || [];
    const templateIds = templates.map((row) => row.id);
    const runIds = runs.map((row) => row.id);

    const [stepsResult, workItems, clientRequests] = await Promise.all([
      templateIds.length ? supabaseAdmin.from("accounting_work_program_template_steps")
        .select("id,template_id,step_key,sequence_no,title,description,work_type,required_role,relative_due_days,due_anchor,dependency_step_keys,capability_id,evidence_required,budget_minutes")
        .in("template_id", templateIds).eq("active", true).order("sequence_no", { ascending: true }) : Promise.resolve({ data: [], error: null }),
      runIds.length ? loadCompletePracticeRowsByIds({
        ids: runIds,
        label: "Accounting practice work-program items",
        buildQuery: (batch, from, to) => supabaseAdmin.from("accounting_engagement_work_items")
          .select("id,run_id,entity_id,step_key,sequence_no,title,description,work_type,required_role,assigned_to,status,start_at,due_at,completed_at,blocked_reason,dependency_step_keys,capability_id,finance_review_item_id,evidence,conclusion,metadata,budget_minutes,scheduled_start_at,scheduled_end_at")
          .eq("accounting_firm_id", access.organizationId)
          .in("run_id", batch)
          .order("sequence_no", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      }) : Promise.resolve([]),
      runIds.length ? loadCompletePracticeRowsByIds({
        ids: runIds,
        label: "Accounting practice work-program client requests",
        buildQuery: (batch, from, to) => supabaseAdmin.from("accounting_client_requests")
          .select("id,run_id,entity_id,work_item_id,title,instructions,status,due_at,sent_at,submitted_at,accepted_at,reminder_policy,client_response,metadata")
          .eq("accounting_firm_id", access.organizationId)
          .in("run_id", batch)
          .order("due_at", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      }) : Promise.resolve([]),
    ]);
    if (stepsResult.error) throw stepsResult.error;

    const stepsByTemplate = new Map();
    for (const step of stepsResult.data || []) { if (!stepsByTemplate.has(step.template_id)) stepsByTemplate.set(step.template_id, []); stepsByTemplate.get(step.template_id).push(step); }
    const itemsByRun = new Map();
    for (const item of workItems || []) { if (!itemsByRun.has(item.run_id)) itemsByRun.set(item.run_id, []); itemsByRun.get(item.run_id).push(item); }
    const requestsByRun = new Map();
    for (const clientRequest of clientRequests || []) { if (!requestsByRun.has(clientRequest.run_id)) requestsByRun.set(clientRequest.run_id, []); requestsByRun.get(clientRequest.run_id).push(clientRequest); }

    return NextResponse.json({ success: true, templates: templates.map((template) => ({ ...template, steps: stepsByTemplate.get(template.id) || [] })), runs: runs.map((run) => ({ ...run, work_items: itemsByRun.get(run.id) || [], client_requests: requestsByRun.get(run.id) || [] })), generated_at: new Date().toISOString() });
  } catch (error) {
    const message = error?.message || "Unable to load accounting work programs";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}

export async function POST() {
  return jsonError(
    "Direct work-program creation is retired. Create accounting cycles through the governed recurring-cycle planner and atomic materializer.",
    409,
    {
      code: "DIRECT_WORK_PROGRAM_CREATION_RETIRED",
      canonical_creation_endpoint: "/api/workspace/finance/recurring-materialize",
    },
  );
}
