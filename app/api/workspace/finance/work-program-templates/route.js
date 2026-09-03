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
  throw lastError || new Error("Finance work program template permission denied");
}

function mutationStatus(message) {
  if (/permission denied/i.test(message)) return 403;
  if (/not found|unavailable/i.test(message)) return 404;
  if (/required|invalid|unique|dependency|configuration/i.test(message)) return 422;
  if (/immutable|active|draft|published/i.test(message)) return 409;
  return 500;
}

async function loadLibrary(access) {
  const { data: templates, error: templatesError } = await supabaseAdmin
    .from("accounting_work_program_templates")
    .select(
      "id,organization_id,template_key,lineage_key,source_template_id,name,description,service_key,cadence,version,status,is_system,metadata,created_by,created_at,updated_at,published_at,published_by,archived_at,archived_by",
    )
    .in("status", ["ACTIVE", "DRAFT", "ARCHIVED"])
    .or(`organization_id.is.null,organization_id.eq.${access.organizationId}`)
    .order("lineage_key", { ascending: true })
    .order("version", { ascending: false });
  if (templatesError) throw templatesError;

  const templateRows = templates || [];
  const templateIds = templateRows.map((row) => row.id);
  const { data: steps, error: stepsError } = templateIds.length
    ? await supabaseAdmin
        .from("accounting_work_program_template_steps")
        .select(
          "id,organization_id,template_id,step_key,sequence_no,title,description,work_type,required_role,relative_due_days,due_anchor,dependency_step_keys,capability_id,instructions,evidence_required,active,metadata,budget_minutes,required_skill_keys,created_at,updated_at",
        )
        .in("template_id", templateIds)
        .order("sequence_no", { ascending: true })
    : { data: [], error: null };
  if (stepsError) throw stepsError;

  const stepsByTemplate = new Map();
  for (const step of steps || []) {
    if (!stepsByTemplate.has(step.template_id)) stepsByTemplate.set(step.template_id, []);
    stepsByTemplate.get(step.template_id).push(step);
  }

  const enriched = templateRows.map((template) => ({
    ...template,
    origin: template.is_system ? "SYSTEM" : "FIRM",
    editable: !template.is_system && template.status === "DRAFT",
    steps: stepsByTemplate.get(template.id) || [],
  }));

  const lineageMap = new Map();
  for (const template of enriched) {
    const key = template.lineage_key || template.template_key;
    if (!lineageMap.has(key)) lineageMap.set(key, []);
    lineageMap.get(key).push(template);
  }

  const lineages = [...lineageMap.entries()].map(([lineageKey, versions]) => {
    const ordered = versions.slice().sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
    return {
      lineage_key: lineageKey,
      name: ordered.find((row) => row.status === "ACTIVE")?.name || ordered[0]?.name || lineageKey,
      active_version_id: ordered.find((row) => row.status === "ACTIVE")?.id || null,
      draft_version_id: ordered.find((row) => row.status === "DRAFT")?.id || null,
      versions: ordered,
    };
  });

  return {
    success: true,
    templates: enriched,
    lineages,
    summary: {
      lineages: lineages.length,
      system_templates: enriched.filter((row) => row.is_system).length,
      active_firm_templates: enriched.filter((row) => !row.is_system && row.status === "ACTIVE").length,
      drafts: enriched.filter((row) => !row.is_system && row.status === "DRAFT").length,
      archived: enriched.filter((row) => !row.is_system && row.status === "ARCHIVED").length,
    },
    generated_at: new Date().toISOString(),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(
      searchParams.get("organizationId") || searchParams.get("organization_id"),
    );
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);
    return NextResponse.json(await loadLibrary(access));
  } catch (error) {
    const message = error?.message || "Unable to load work program templates";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const action = clean(body.action).toLowerCase();
    if (!action) return jsonError("action is required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);
    const actor = access.user?.id;
    if (!actor) return jsonError("Authenticated user is required", 401);

    let result = null;
    if (action === "clone") {
      const sourceTemplateId = clean(body.sourceTemplateId || body.source_template_id);
      if (!sourceTemplateId) return jsonError("sourceTemplateId is required");
      const response = await supabaseAdmin.rpc("clone_accounting_work_program_template", {
        p_source_template_id: sourceTemplateId,
        p_accounting_firm_id: access.organizationId,
        p_actor: actor,
        p_name: clean(body.name) || null,
      });
      if (response.error) throw response.error;
      result = { template_id: response.data };
    } else if (action === "save") {
      const template = body.template || {};
      const templateId = clean(template.id || body.templateId || body.template_id);
      if (!templateId) return jsonError("template.id is required");
      const response = await supabaseAdmin.rpc("save_accounting_work_program_template_draft", {
        p_template_id: templateId,
        p_accounting_firm_id: access.organizationId,
        p_actor: actor,
        p_name: clean(template.name),
        p_description: clean(template.description),
        p_service_key: clean(template.service_key),
        p_cadence: clean(template.cadence).toUpperCase(),
        p_metadata: template.metadata && typeof template.metadata === "object" ? template.metadata : {},
        p_steps: Array.isArray(template.steps) ? template.steps : [],
      });
      if (response.error) throw response.error;
      result = { template_id: response.data };
    } else if (action === "publish") {
      const templateId = clean(body.templateId || body.template_id);
      if (!templateId) return jsonError("templateId is required");
      const response = await supabaseAdmin.rpc("publish_accounting_work_program_template", {
        p_template_id: templateId,
        p_accounting_firm_id: access.organizationId,
        p_actor: actor,
      });
      if (response.error) throw response.error;
      result = { template_id: response.data };
    } else if (action === "archive") {
      const templateId = clean(body.templateId || body.template_id);
      if (!templateId) return jsonError("templateId is required");
      const response = await supabaseAdmin.rpc("archive_accounting_work_program_template", {
        p_template_id: templateId,
        p_accounting_firm_id: access.organizationId,
        p_actor: actor,
      });
      if (response.error) throw response.error;
      result = { template_id: response.data };
    } else {
      return jsonError("Unsupported work program template action", 400);
    }

    const library = await loadLibrary(access);
    return NextResponse.json({ ...library, action, result });
  } catch (error) {
    const message = error?.message || "Unable to update work program template";
    return jsonError(message, mutationStatus(message));
  }
}
