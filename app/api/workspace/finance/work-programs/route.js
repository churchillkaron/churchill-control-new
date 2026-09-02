export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.close.execute", "finance.configuration.manage"];

function clean(value) { return String(value ?? "").trim(); }
function jsonError(message, status = 400) { return NextResponse.json({ success: false, error: message }, { status }); }
function addDays(value, days) { const date = new Date(value); date.setUTCDate(date.getUTCDate() + Number(days || 0)); return date.toISOString(); }

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
  throw lastError || new Error("Finance work program permission denied");
}

async function getEngagement(access, engagementId) {
  const { data, error } = await supabaseAdmin.from("accounting_engagements").select("*").eq("id", engagementId).eq("accounting_firm_id", access.organizationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Accounting engagement not found for this firm");
  return data;
}

async function getTemplate(access, templateId) {
  const { data, error } = await supabaseAdmin.from("accounting_work_program_templates").select("*").eq("id", templateId).eq("status", "ACTIVE").maybeSingle();
  if (error) throw error;
  if (!data || (data.organization_id && data.organization_id !== access.organizationId)) throw new Error("Work program template is unavailable for this firm");
  return data;
}

async function resolveEntity(engagement, requestedEntityId) {
  const entityId = requestedEntityId || engagement.entity_id || null;
  if (entityId) {
    const { data, error } = await supabaseAdmin.from("legal_entities").select("id").eq("id", entityId).eq("organization_id", engagement.organization_id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Selected legal entity does not belong to the engagement client");
    return entityId;
  }
  const { data, error } = await supabaseAdmin.from("legal_entities").select("id").eq("organization_id", engagement.organization_id).limit(3);
  if (error) throw error;
  if ((data || []).length === 1) return data[0].id;
  if (!(data || []).length) throw new Error("Client organization has no legal entity");
  throw new Error("Multiple legal entities exist; entityId is required for the engagement run");
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

    let runsQuery = supabaseAdmin.from("accounting_engagement_runs")
      .select("id,organization_id,entity_id,engagement_id,template_id,period_id,run_key,cadence,status,start_at,due_at,completed_at,rolled_from_run_id,created_at,updated_at")
      .eq("accounting_firm_id", access.organizationId).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
    if (engagementId) runsQuery = runsQuery.eq("engagement_id", engagementId);
    if (runId) runsQuery = runsQuery.eq("id", runId);

    const [templatesResult, runsResult] = await Promise.all([templateQuery, runsQuery]);
    if (templatesResult.error) throw templatesResult.error;
    if (runsResult.error) throw runsResult.error;
    const templates = templatesResult.data || [];
    const runs = runsResult.data || [];
    const templateIds = templates.map((row) => row.id);
    const runIds = runs.map((row) => row.id);

    const [stepsResult, workItemsResult, requestsResult] = await Promise.all([
      templateIds.length ? supabaseAdmin.from("accounting_work_program_template_steps")
        .select("id,template_id,step_key,sequence_no,title,description,work_type,required_role,relative_due_days,due_anchor,dependency_step_keys,capability_id,evidence_required,budget_minutes")
        .in("template_id", templateIds).eq("active", true).order("sequence_no", { ascending: true }) : Promise.resolve({ data: [], error: null }),
      runIds.length ? supabaseAdmin.from("accounting_engagement_work_items")
        .select("id,run_id,entity_id,step_key,sequence_no,title,description,work_type,required_role,assigned_to,status,start_at,due_at,completed_at,blocked_reason,dependency_step_keys,capability_id,finance_review_item_id,evidence,conclusion,metadata,budget_minutes,scheduled_start_at,scheduled_end_at")
        .eq("accounting_firm_id", access.organizationId).in("run_id", runIds).order("sequence_no", { ascending: true }) : Promise.resolve({ data: [], error: null }),
      runIds.length ? supabaseAdmin.from("accounting_client_requests")
        .select("id,run_id,entity_id,work_item_id,title,instructions,status,due_at,sent_at,submitted_at,accepted_at,reminder_policy,client_response,metadata")
        .eq("accounting_firm_id", access.organizationId).in("run_id", runIds).order("due_at", { ascending: true, nullsFirst: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    if (stepsResult.error) throw stepsResult.error;
    if (workItemsResult.error) throw workItemsResult.error;
    if (requestsResult.error) throw requestsResult.error;

    const stepsByTemplate = new Map();
    for (const step of stepsResult.data || []) { if (!stepsByTemplate.has(step.template_id)) stepsByTemplate.set(step.template_id, []); stepsByTemplate.get(step.template_id).push(step); }
    const itemsByRun = new Map();
    for (const item of workItemsResult.data || []) { if (!itemsByRun.has(item.run_id)) itemsByRun.set(item.run_id, []); itemsByRun.get(item.run_id).push(item); }
    const requestsByRun = new Map();
    for (const clientRequest of requestsResult.data || []) { if (!requestsByRun.has(clientRequest.run_id)) requestsByRun.set(clientRequest.run_id, []); requestsByRun.get(clientRequest.run_id).push(clientRequest); }

    return NextResponse.json({ success: true, templates: templates.map((template) => ({ ...template, steps: stepsByTemplate.get(template.id) || [] })), runs: runs.map((run) => ({ ...run, work_items: itemsByRun.get(run.id) || [], client_requests: requestsByRun.get(run.id) || [] })), generated_at: new Date().toISOString() });
  } catch (error) {
    const message = error?.message || "Unable to load accounting work programs";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const engagementId = clean(body.engagementId || body.engagement_id);
    const templateId = clean(body.templateId || body.template_id);
    const runKey = clean(body.runKey || body.run_key);
    const requestedEntityId = clean(body.entityId || body.entity_id) || null;
    const startAt = body.startAt || body.start_at || new Date().toISOString();
    const periodEnd = body.periodEnd || body.period_end || body.dueAt || body.due_at;
    const periodId = body.periodId || body.period_id || null;
    if (!engagementId || !templateId || !runKey || !periodEnd) return jsonError("engagementId, templateId, runKey and periodEnd are required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);
    const [engagement, template] = await Promise.all([getEngagement(access, engagementId), getTemplate(access, templateId)]);
    const entityId = await resolveEntity(engagement, requestedEntityId);

    const { data: profile, error: profileError } = await supabaseAdmin.from("accounting_client_profiles")
      .select("assigned_accountant_id,assigned_reviewer_id,assigned_partner_id").eq("accounting_firm_id", access.organizationId).eq("organization_id", engagement.organization_id).maybeSingle();
    if (profileError) throw profileError;
    const { data: steps, error: stepsError } = await supabaseAdmin.from("accounting_work_program_template_steps").select("*").eq("template_id", template.id).eq("active", true).order("sequence_no", { ascending: true });
    if (stepsError) throw stepsError;
    if (!(steps || []).length) throw new Error("Work program template has no active steps");

    const { data: run, error: runError } = await supabaseAdmin.from("accounting_engagement_runs").insert({
      accounting_firm_id: access.organizationId, organization_id: engagement.organization_id, entity_id: entityId, engagement_id: engagement.id, template_id: template.id,
      period_id: periodId, run_key: runKey, cadence: template.cadence, status: "PLANNED", start_at: startAt, due_at: periodEnd,
      created_by: access.user?.id || null, metadata: { template_version: template.version, entity_id: entityId },
    }).select("*").single();
    if (runError) { if (runError.code === "23505") return jsonError("This engagement run already exists", 409); throw runError; }

    try {
      const workItems = (steps || []).map((step) => {
        const anchor = step.due_anchor === "RUN_START" ? startAt : periodEnd;
        const dependencies = step.dependency_step_keys || [];
        const ready = dependencies.length === 0;
        let assignedTo = null;
        if (step.required_role === "PREPARER") assignedTo = profile?.assigned_accountant_id || null;
        if (step.required_role === "REVIEWER") assignedTo = profile?.assigned_reviewer_id || null;
        if (step.required_role === "PARTNER") assignedTo = profile?.assigned_partner_id || null;
        return {
          accounting_firm_id: access.organizationId, organization_id: engagement.organization_id, entity_id: entityId, run_id: run.id, template_step_id: step.id,
          step_key: step.step_key, sequence_no: step.sequence_no, title: step.title, description: step.description, work_type: step.work_type, required_role: step.required_role,
          assigned_to: assignedTo, status: ready ? "READY" : "NOT_STARTED", start_at: ready ? startAt : null, due_at: addDays(anchor, step.relative_due_days),
          blocked_reason: null, dependency_step_keys: dependencies, capability_id: step.capability_id || null,
          budget_minutes: Number(step.budget_minutes || 0), metadata: { template_version: template.version, evidence_required: Boolean(step.evidence_required) },
        };
      });
      const { data: insertedItems, error: itemsError } = await supabaseAdmin.from("accounting_engagement_work_items").insert(workItems).select("*");
      if (itemsError) throw itemsError;
      const clientRequestRows = (insertedItems || []).filter((item) => item.work_type === "CLIENT_REQUEST").map((item) => ({
        accounting_firm_id: access.organizationId, organization_id: engagement.organization_id, entity_id: entityId, run_id: run.id, work_item_id: item.id,
        title: item.title, instructions: item.description, status: "DRAFT", due_at: item.due_at, reminder_policy: { mode: "manual_until_sent" }, created_by: access.user?.id || null, metadata: { source: "work_program" },
      }));
      if (clientRequestRows.length) { const { error: requestsError } = await supabaseAdmin.from("accounting_client_requests").insert(clientRequestRows); if (requestsError) throw requestsError; }
      return NextResponse.json({ success: true, run, work_items: insertedItems || [], client_requests_created: clientRequestRows.length, budget_minutes: workItems.reduce((total, item) => total + Number(item.budget_minutes || 0), 0) }, { status: 201 });
    } catch (error) {
      await supabaseAdmin.from("accounting_engagement_runs").delete().eq("id", run.id);
      throw error;
    }
  } catch (error) {
    const message = error?.message || "Unable to create accounting work program run";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
