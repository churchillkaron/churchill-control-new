import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(value) {
  const organizationId = String(value || "").trim();
  if (!organizationId) {
    const error = new Error("Service execution templates require organization_id.");
    error.status = 400;
    throw error;
  }
  return organizationId;
}

function throwResultError(result, fallback) {
  if (!result?.error) return result;
  const error = new Error(result.error.message || fallback);
  error.code = result.error.code;
  throw error;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

export async function getServiceExecutionTemplate({
  organizationId,
  templateId,
  status = null,
}) {
  const organization_id = requireOrganizationId(organizationId);
  const reference = String(templateId || "").trim();

  if (!reference) return null;

  let query = supabaseAdmin
    .from("service_execution_templates")
    .select("*")
    .eq("organization_id", organization_id);

  if (isUuid(reference)) {
    query = query.eq("id", reference);
  } else {
    query = query.eq("code", reference).order("version", { ascending: false }).limit(1);
  }

  if (status) query = query.eq("status", status);

  const result = await query.maybeSingle();
  throwResultError(result, "Unable to load service execution template.");
  return result.data || null;
}

export async function listServiceExecutionTemplates({
  organizationId,
  entityId = null,
  industryKey = null,
  status = "active",
  limit = 250,
}) {
  const organization_id = requireOrganizationId(organizationId);
  let query = supabaseAdmin
    .from("service_execution_templates")
    .select("*")
    .eq("organization_id", organization_id)
    .order("name", { ascending: true })
    .order("version", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 250, 1000)));

  if (entityId) query = query.eq("entity_id", entityId);
  if (industryKey) query = query.eq("industry_key", industryKey);
  if (status) query = query.eq("status", status);

  const result = await query;
  throwResultError(result, "Unable to load service execution templates.");
  return result.data || [];
}

export async function insertServiceExecutionTemplate({
  organizationId,
  entityId = null,
  actorId = null,
  template,
}) {
  const organization_id = requireOrganizationId(organizationId);
  const latest = await supabaseAdmin
    .from("service_execution_templates")
    .select("version")
    .eq("organization_id", organization_id)
    .eq("code", template.code)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwResultError(latest, "Unable to resolve execution template version.");
  const version = (Number(latest.data?.version) || 0) + 1;

  const result = await supabaseAdmin
    .from("service_execution_templates")
    .insert({
      organization_id,
      entity_id: entityId || null,
      code: template.code,
      name: template.name,
      description: template.description,
      industry_key: template.industry_key,
      version,
      status: "active",
      field_schema: template.field_schema,
      evidence_requirements: template.evidence_requirements,
      completion_rules: template.completion_rules,
      instructions: template.instructions,
      created_by: actorId || null,
      updated_by: actorId || null,
    })
    .select("*")
    .single();

  throwResultError(result, "Unable to create service execution template.");
  return result.data;
}

export default Object.freeze({
  getServiceExecutionTemplate,
  listServiceExecutionTemplates,
  insertServiceExecutionTemplate,
});
