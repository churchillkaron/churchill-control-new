export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = [
  "finance.accounting.manage",
  "finance.close.execute",
  "finance.configuration.manage",
];

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function addDays(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString();
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
  throw lastError || new Error("Finance work program permission denied");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const sourceRunId = clean(body.sourceRunId || body.source_run_id);
    const runKey = clean(body.runKey || body.run_key);
    const startAt = body.startAt || body.start_at || new Date().toISOString();
    const periodEnd = body.periodEnd || body.period_end || body.dueAt || body.due_at;
    const periodId = body.periodId || body.period_id || null;
    if (!sourceRunId || !runKey || !periodEnd) return jsonError("sourceRunId, runKey and periodEnd are required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const { data: sourceRun, error: sourceError } = await supabaseAdmin
      .from("accounting_engagement_runs")
      .select("*")
      .eq("id", sourceRunId)
      .eq("accounting_firm_id", access.organizationId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!sourceRun) return jsonError("Source accounting work program not found", 404);
    if (sourceRun.status !== "COMPLETE" || !sourceRun.locked_at) return jsonError("Only a completed and locked work program can roll forward", 409);

    const [templateResult, stepsResult, profileResult] = await Promise.all([
      supabaseAdmin.from("accounting_work_program_templates").select("*").eq("id", sourceRun.template_id).maybeSingle(),
      supabaseAdmin.from("accounting_work_program_template_steps").select("*").eq("template_id", sourceRun.template_id).eq("active", true).order("sequence_no", { ascending: true }),
      supabaseAdmin.from("accounting_client_profiles").select("assigned_accountant_id,assigned_reviewer_id,assigned_partner_id").eq("accounting_firm_id", access.organizationId).eq("organization_id", sourceRun.organization_id).maybeSingle(),
    ]);
    if (templateResult.error) throw templateResult.error;
    if (stepsResult.error) throw stepsResult.error;
    if (profileResult.error) throw profileResult.error;
    if (!templateResult.data) return jsonError("Source work program template is unavailable", 409);
    if (!(stepsResult.data || []).length) return jsonError("Source template has no active steps", 409);

    const template = templateResult.data;
    const profile = profileResult.data || {};
    const metadata = {
      template_version: template.version,
      rolled_from_run_id: sourceRun.id,
      ...(sourceRun.metadata?.entity_id ? { entity_id: sourceRun.metadata.entity_id } : {}),
    };

    const { data: nextRun, error: runError } = await supabaseAdmin
      .from("accounting_engagement_runs")
      .insert({
        accounting_firm_id: access.organizationId,
        organization_id: sourceRun.organization_id,
        engagement_id: sourceRun.engagement_id,
        template_id: sourceRun.template_id,
        period_id: periodId,
        run_key: runKey,
        cadence: sourceRun.cadence,
        status: "PLANNED",
        start_at: startAt,
        due_at: periodEnd,
        rolled_from_run_id: sourceRun.id,
        created_by: access.user?.id || null,
        metadata,
      })
      .select("*")
      .single();
    if (runError) {
      if (runError.code === "23505") return jsonError("The next engagement run already exists", 409);
      throw runError;
    }

    try {
      const workRows = (stepsResult.data || []).map((step, index) => {
        const anchor = step.due_anchor === "RUN_START" ? startAt : periodEnd;
        let assignedTo = null;
        if (step.required_role === "PREPARER") assignedTo = profile.assigned_accountant_id || null;
        if (step.required_role === "REVIEWER") assignedTo = profile.assigned_reviewer_id || null;
        if (step.required_role === "PARTNER") assignedTo = profile.assigned_partner_id || null;
        return {
          accounting_firm_id: access.organizationId,
          organization_id: sourceRun.organization_id,
          run_id: nextRun.id,
          template_step_id: step.id,
          step_key: step.step_key,
          sequence_no: step.sequence_no,
          title: step.title,
          description: step.description,
          work_type: step.work_type,
          required_role: step.required_role,
          assigned_to: assignedTo,
          status: index === 0 ? "READY" : "BLOCKED",
          start_at: index === 0 ? startAt : null,
          due_at: addDays(anchor, step.relative_due_days),
          blocked_reason: index === 0 ? null : "Waiting for prerequisite work",
          dependency_step_keys: step.dependency_step_keys || [],
          capability_id: step.capability_id || null,
          evidence: {},
          conclusion: null,
          metadata: { template_version: template.version, evidence_required: Boolean(step.evidence_required), rolled_forward_without_prior_evidence: true },
        };
      });

      const { data: workItems, error: itemsError } = await supabaseAdmin.from("accounting_engagement_work_items").insert(workRows).select("*");
      if (itemsError) throw itemsError;

      const requestRows = (workItems || [])
        .filter((item) => item.work_type === "CLIENT_REQUEST")
        .map((item) => ({
          accounting_firm_id: access.organizationId,
          organization_id: sourceRun.organization_id,
          run_id: nextRun.id,
          work_item_id: item.id,
          title: item.title,
          instructions: item.description,
          status: "DRAFT",
          due_at: item.due_at,
          reminder_policy: { mode: "manual_until_sent" },
          client_response: {},
          created_by: access.user?.id || null,
          metadata: { source: "roll_forward", rolled_from_run_id: sourceRun.id },
        }));
      if (requestRows.length) {
        const { error: requestsError } = await supabaseAdmin.from("accounting_client_requests").insert(requestRows);
        if (requestsError) throw requestsError;
      }

      const { error: auditError } = await supabaseAdmin.from("organization_audit_logs").insert({
        organization_id: access.organizationId,
        entity_type: "accounting_engagement_run",
        entity_id: nextRun.id,
        action: "ACCOUNTING_ENGAGEMENT_RUN_ROLLED_FORWARD",
        before_data: { source_run_id: sourceRun.id, source_status: sourceRun.status, source_completed_at: sourceRun.completed_at },
        after_data: nextRun,
        metadata: { source_run_id: sourceRun.id, template_id: sourceRun.template_id, evidence_carried_forward: false },
        actor_email: access.user?.email || null,
      });
      if (auditError) throw auditError;

      return NextResponse.json({ success: true, run: nextRun, work_items: workItems || [], client_requests_created: requestRows.length, evidence_carried_forward: false }, { status: 201 });
    } catch (error) {
      await supabaseAdmin.from("accounting_engagement_runs").delete().eq("id", nextRun.id).eq("accounting_firm_id", access.organizationId);
      throw error;
    }
  } catch (error) {
    const message = error?.message || "Unable to roll forward accounting work program";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
