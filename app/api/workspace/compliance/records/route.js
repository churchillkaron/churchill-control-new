export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const RESOURCES = Object.freeze({
  frameworks: {
    table: "compliance_frameworks",
    order: "updated_at",
    fields: ["framework_code", "framework_name", "framework_type", "issuing_authority", "jurisdiction_code", "version", "effective_from", "effective_to", "status", "metadata"],
  },
  requirements: {
    table: "compliance_requirements",
    order: "updated_at",
    fields: ["framework_id", "requirement_code", "title", "description", "parent_requirement_id", "mandatory", "effective_from", "effective_to", "status", "metadata"],
  },
  controls: {
    table: "compliance_controls",
    order: "updated_at",
    fields: ["control_code", "control_name", "description", "control_type", "frequency", "owner_staff_id", "source_domain", "source_type", "source_id", "status", "automation_level", "metadata"],
  },
  evidence: {
    table: "compliance_evidence",
    order: "updated_at",
    fields: ["control_id", "requirement_id", "enterprise_document_id", "evidence_type", "title", "description", "source_domain", "source_type", "source_id", "evidence_date", "valid_from", "valid_until", "verification_status", "metadata"],
  },
  tests: {
    table: "compliance_control_tests",
    order: "updated_at",
    fields: ["control_id", "test_type", "period_start", "period_end", "due_date", "performed_by", "performed_at", "result", "sample_size", "exceptions_found", "notes", "evidence"],
  },
  obligations: {
    table: "compliance_obligations",
    order: "updated_at",
    fields: ["obligation_type", "obligation_code", "title", "description", "framework_id", "requirement_id", "authority_name", "jurisdiction_code", "reference_number", "owner_staff_id", "source_domain", "source_type", "source_id", "effective_from", "due_date", "expiry_date", "renewal_lead_days", "recurrence_rule", "status", "criticality", "enterprise_document_id", "metadata"],
  },
  risks: {
    table: "compliance_risks",
    order: "updated_at",
    fields: ["risk_code", "title", "description", "category", "owner_staff_id", "source_domain", "source_type", "source_id", "inherent_likelihood", "inherent_impact", "residual_likelihood", "residual_impact", "appetite_level", "treatment_strategy", "status", "next_review_date", "metadata"],
  },
  issues: {
    table: "compliance_issues",
    order: "updated_at",
    fields: ["issue_code", "title", "description", "issue_type", "severity", "status", "owner_staff_id", "control_id", "requirement_id", "risk_id", "obligation_id", "control_test_id", "source_domain", "source_type", "source_id", "identified_at", "due_date", "resolved_at", "resolution_summary", "metadata"],
  },
  remediation: {
    table: "compliance_remediation_actions",
    order: "updated_at",
    fields: ["issue_id", "action_number", "title", "description", "owner_staff_id", "due_date", "status", "completed_at", "completion_evidence", "verified_by", "verified_at"],
  },
});

function clean(value) {
  return String(value ?? "").trim();
}

function resourceFor(value) {
  return RESOURCES[clean(value).toLowerCase()] || null;
}

function pick(body, fields) {
  const result = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(body || {}, field)) result[field] = body[field];
  }
  return result;
}

async function scope(request, body = {}) {
  const url = new URL(request.url);
  const organizationId = clean(body.organizationId || body.organization_id || url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
  const entityId = clean(body.entityId || body.entity_id || url.searchParams.get("entityId") || url.searchParams.get("entity_id"));
  const periodId = clean(body.periodId || body.period_id || url.searchParams.get("periodId") || url.searchParams.get("period_id"));

  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { error: access };

  const context = await resolveBusinessContext({
    organizationId: access.organizationId,
    entityId: entityId || null,
    periodId: periodId || null,
    request,
    access,
  });
  if (!context.success) return { error: context };

  return { access, context, staffAccountId: access.access?.staffAccountId || access.staff?.id || null };
}

function bad(error, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const resourceKey = clean(url.searchParams.get("resource"));
    const resource = resourceFor(resourceKey);
    if (!resource) return bad("Unsupported Compliance resource");

    const resolved = await scope(request);
    if (resolved.error) return bad(resolved.error.error, resolved.error.status || 403);
    const { context } = resolved;

    let query = supabaseAdmin
      .from(resource.table)
      .select("*")
      .eq("organization_id", context.organizationId);
    if (context.entityId) query = query.or(`entity_id.eq.${context.entityId},entity_id.is.null`);
    else query = query.is("entity_id", null);

    const status = clean(url.searchParams.get("status"));
    if (status) query = query.eq("status", status);

    const { data, error } = await query
      .order(resource.order, { ascending: false })
      .limit(Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 1000, 5000)));
    if (error) throw error;

    return NextResponse.json({ success: true, resource: resourceKey, rows: data || [] });
  } catch (error) {
    console.error("COMPLIANCE_RECORDS_GET_FAILED", error);
    return bad(error?.message || "Compliance records could not be loaded", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resourceKey = clean(body.resource);
    const resource = resourceFor(resourceKey);
    if (!resource) return bad("Unsupported Compliance resource");

    const resolved = await scope(request, body);
    if (resolved.error) return bad(resolved.error.error, resolved.error.status || 403);
    const { context, staffAccountId } = resolved;

    const values = {
      organization_id: context.organizationId,
      entity_id: context.entityId || null,
      ...pick(body.data || {}, resource.fields),
      created_by: staffAccountId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from(resource.table)
      .insert(values)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, resource: resourceKey, row: data }, { status: 201 });
  } catch (error) {
    console.error("COMPLIANCE_RECORDS_POST_FAILED", error);
    return bad(error?.message || "Compliance record could not be created", 500);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resourceKey = clean(body.resource);
    const resource = resourceFor(resourceKey);
    const id = clean(body.id);
    if (!resource || !id) return bad("Compliance resource and id are required");

    const resolved = await scope(request, body);
    if (resolved.error) return bad(resolved.error.error, resolved.error.status || 403);
    const { context } = resolved;

    const values = {
      ...pick(body.data || {}, resource.fields),
      updated_at: new Date().toISOString(),
    };
    if (!Object.keys(values).length) return bad("No supported Compliance fields supplied");

    let query = supabaseAdmin
      .from(resource.table)
      .update(values)
      .eq("organization_id", context.organizationId)
      .eq("id", id);
    if (context.entityId) query = query.or(`entity_id.eq.${context.entityId},entity_id.is.null`);
    else query = query.is("entity_id", null);

    const { data, error } = await query.select("*").maybeSingle();
    if (error) throw error;
    if (!data) return bad("Compliance record not found", 404);

    return NextResponse.json({ success: true, resource: resourceKey, row: data });
  } catch (error) {
    console.error("COMPLIANCE_RECORDS_PATCH_FAILED", error);
    return bad(error?.message || "Compliance record could not be updated", 500);
  }
}
