export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const WRITE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "MANAGER",
]);

const RESOURCES = Object.freeze({
  "legal-entities": {
    table: "legal_entities",
    order: ["display_name", true],
    fields: new Set([
      "code",
      "legal_name",
      "display_name",
      "tax_id",
      "registration_number",
      "country",
      "currency",
      "address",
      "phone",
      "email",
      "parent_entity_id",
      "is_holding_company",
      "is_active",
      "is_default_accounting_entity",
      "timezone",
      "locale",
      "governance_review_required",
      "governance_review_reasons",
    ]),
  },
  "business-locations": {
    table: "business_locations",
    order: ["name", true],
    fields: new Set([
      "code",
      "name",
      "description",
      "location_type",
      "business_unit_id",
      "department_id",
      "status",
      "address",
      "city",
      "province",
      "postal_code",
      "country",
      "timezone",
      "currency_code",
      "phone",
      "email",
      "is_default",
      "metadata",
    ]),
  },
  modules: {
    table: "organization_modules",
    order: ["module_id", true],
    fields: new Set(["module_id", "status"]),
  },
  permissions: {
    table: "role_permissions",
    order: ["role", true],
    fields: new Set([
      "role",
      "module",
      "can_view",
      "can_create",
      "can_update",
      "can_delete",
    ]),
  },
});

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeRole(value) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function resourceDefinition(value) {
  return RESOURCES[clean(value).toLowerCase()] || null;
}

function cleanPayload(input, allowedFields) {
  const result = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const [key, value] of Object.entries(input)) {
    if (!allowedFields.has(key)) continue;
    if (value === undefined) continue;
    result[key] = value === "" ? null : value;
  }
  return result;
}

function canWrite(access) {
  const role = normalizeRole(access?.role || access?.staff?.role || access?.access?.role);
  return WRITE_ROLES.has(role);
}

async function resolveAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      ),
    };
  }
  return { access };
}

async function audit({ organizationId, access, entityType, entityId, action, beforeData = null, afterData = null }) {
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: organizationId,
    entity_type: entityType,
    entity_id: entityId || null,
    action,
    before_data: beforeData,
    after_data: afterData,
    metadata: { source: "administration-control-plane" },
    actor_email: access?.userEmail || access?.user?.email || null,
  });
  if (error) throw error;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const resourceKey = clean(url.searchParams.get("resource"));
    const definition = resourceDefinition(resourceKey);
    if (!organizationId || !definition) {
      return NextResponse.json({ success: false, error: "organizationId and valid resource are required" }, { status: 400 });
    }

    const resolved = await resolveAccess(request, organizationId);
    if (resolved.response) return resolved.response;

    let query = supabaseAdmin
      .from(definition.table)
      .select("*")
      .eq("organization_id", resolved.access.organizationId)
      .limit(5000);

    if (definition.order) {
      query = query.order(definition.order[0], { ascending: definition.order[1] });
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      organizationId: resolved.access.organizationId,
      resource: resourceKey,
      writable: canWrite(resolved.access),
      rows: data || [],
    });
  } catch (error) {
    console.error("ADMINISTRATION_RECORDS_GET_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Administration records failed" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body?.organizationId || body?.organization_id);
    const resourceKey = clean(body?.resource);
    const definition = resourceDefinition(resourceKey);
    if (!organizationId || !definition) {
      return NextResponse.json({ success: false, error: "organizationId and valid resource are required" }, { status: 400 });
    }

    const resolved = await resolveAccess(request, organizationId);
    if (resolved.response) return resolved.response;
    if (!canWrite(resolved.access)) {
      return NextResponse.json({ success: false, error: "Administration write access required" }, { status: 403 });
    }

    const payload = cleanPayload(body?.data, definition.fields);
    if (!Object.keys(payload).length) {
      return NextResponse.json({ success: false, error: "No valid fields supplied" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from(definition.table)
      .insert({ organization_id: resolved.access.organizationId, ...payload })
      .select("*")
      .single();
    if (error) throw error;

    await audit({
      organizationId: resolved.access.organizationId,
      access: resolved.access,
      entityType: definition.table,
      entityId: data?.id,
      action: "CREATE",
      afterData: data,
    });

    return NextResponse.json({ success: true, row: data });
  } catch (error) {
    console.error("ADMINISTRATION_RECORDS_POST_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Administration record could not be created" }, { status: 400 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body?.organizationId || body?.organization_id);
    const resourceKey = clean(body?.resource);
    const id = clean(body?.id);
    const definition = resourceDefinition(resourceKey);
    if (!organizationId || !definition || !id) {
      return NextResponse.json({ success: false, error: "organizationId, resource and id are required" }, { status: 400 });
    }

    const resolved = await resolveAccess(request, organizationId);
    if (resolved.response) return resolved.response;
    if (!canWrite(resolved.access)) {
      return NextResponse.json({ success: false, error: "Administration write access required" }, { status: 403 });
    }

    const payload = cleanPayload(body?.data, definition.fields);
    if (!Object.keys(payload).length) {
      return NextResponse.json({ success: false, error: "No valid fields supplied" }, { status: 400 });
    }

    const { data: beforeData, error: beforeError } = await supabaseAdmin
      .from(definition.table)
      .select("*")
      .eq("organization_id", resolved.access.organizationId)
      .eq("id", id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!beforeData) {
      return NextResponse.json({ success: false, error: "Administration record not found" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from(definition.table)
      .update(payload)
      .eq("organization_id", resolved.access.organizationId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await audit({
      organizationId: resolved.access.organizationId,
      access: resolved.access,
      entityType: definition.table,
      entityId: id,
      action: "UPDATE",
      beforeData,
      afterData: data,
    });

    return NextResponse.json({ success: true, row: data });
  } catch (error) {
    console.error("ADMINISTRATION_RECORDS_PATCH_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Administration record could not be updated" }, { status: 400 });
  }
}
