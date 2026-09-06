export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "HR_ADMIN",
]);
const QUALIFICATION_STATUSES = new Set(["active", "inactive", "archived"]);

function text(value) {
  return String(value ?? "").trim();
}

function roleOf(value) {
  return text(value).toUpperCase();
}

function qualificationCode(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dateOrNull(value, label) {
  const normalized = text(value);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const error = new Error(`${label} must use YYYY-MM-DD format`);
    error.status = 400;
    throw error;
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    const error = new Error(`${label} is not a valid date`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function contextError(context) {
  return NextResponse.json({
    success: false,
    error: context.error,
    code: context.code,
    availableOrganizationIds: context.availableOrganizationIds || [],
  }, { status: context.status || 403 });
}

async function managementContext(request, requestedOrganizationId = null) {
  const context = await resolveAuthenticatedStaffContext({
    request,
    organizationId: requestedOrganizationId || null,
  });
  if (!context.success) return { response: contextError(context) };
  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json({
        success: false,
        error: "People qualification management permission required",
      }, { status: 403 }),
    };
  }
  return { organizationId: context.organizationId, manager: context.staff, role };
}

function publicHolding(row, catalogById, staffById) {
  const qualification = catalogById.get(row.qualification_id);
  const staff = staffById.get(row.staff_id);
  return {
    id: row.id,
    staff_id: row.staff_id,
    staff_name: staff?.name || staff?.email || "Staff",
    staff_role: staff?.position || staff?.role || null,
    qualification_id: row.qualification_id,
    qualification_code: qualification?.code || null,
    qualification_name: qualification?.name || null,
    status: row.status,
    valid_from: row.valid_from || null,
    valid_until: row.valid_until || null,
    evidence_reference: row.evidence_reference || null,
    verified_at: row.verified_at || null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestedOrganizationId = url.searchParams.get("organizationId") || null;
    const catalogOnly = url.searchParams.get("scope") === "catalog";

    if (catalogOnly) {
      const context = await resolveAuthenticatedStaffContext({
        request,
        organizationId: requestedOrganizationId,
      });
      if (!context.success) return contextError(context);
      const catalogResult = await supabaseAdmin
        .from("people_qualification_catalog")
        .select("id,code,name,description,status")
        .eq("organization_id", context.organizationId)
        .eq("status", "active")
        .order("name", { ascending: true });
      if (catalogResult.error) throw catalogResult.error;
      return NextResponse.json({
        success: true,
        organizationId: context.organizationId,
        scope: "catalog",
        catalog: catalogResult.data || [],
      });
    }

    const ctx = await managementContext(request, requestedOrganizationId);
    if (ctx.response) return ctx.response;
    const includeArchived = url.searchParams.get("status") === "all";

    let catalogQuery = supabaseAdmin
      .from("people_qualification_catalog")
      .select("id,code,name,description,status,created_at,updated_at")
      .eq("organization_id", ctx.organizationId)
      .order("name", { ascending: true });
    if (!includeArchived) catalogQuery = catalogQuery.eq("status", "active");

    const [catalogResult, staffResult, holdingsResult] = await Promise.all([
      catalogQuery,
      supabaseAdmin
        .from("staff_accounts")
        .select("id,name,email,role,position,department,party_id,active")
        .eq("active_organization_id", ctx.organizationId)
        .eq("active", true)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("staff_qualifications")
        .select("id,staff_id,qualification_id,status,valid_from,valid_until,evidence_reference,verified_at")
        .eq("organization_id", ctx.organizationId)
        .order("updated_at", { ascending: false }),
    ]);
    if (catalogResult.error) throw catalogResult.error;
    if (staffResult.error) throw staffResult.error;
    if (holdingsResult.error) throw holdingsResult.error;

    const catalog = catalogResult.data || [];
    const staff = staffResult.data || [];
    const catalogById = new Map(catalog.map((row) => [row.id, row]));
    const staffById = new Map(staff.map((row) => [row.id, row]));

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      role: ctx.role,
      catalog,
      staff,
      holdings: (holdingsResult.data || []).map((row) => publicHolding(row, catalogById, staffById)),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Unable to load People qualifications",
    }, { status: error?.status || 400 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId = text(body?.organizationId || body?.organization_id) || null;
    const ctx = await managementContext(request, requestedOrganizationId);
    if (ctx.response) return ctx.response;
    const action = text(body?.action).toLowerCase();

    if (action === "create-qualification") {
      const name = text(body?.name);
      const code = qualificationCode(body?.code || name);
      if (!name || !code) return NextResponse.json({ success: false, error: "Qualification name is required" }, { status: 400 });

      const { data, error } = await supabaseAdmin
        .from("people_qualification_catalog")
        .insert({
          organization_id: ctx.organizationId,
          code,
          name,
          description: text(body?.description) || null,
          status: "active",
          created_by: ctx.manager?.id || null,
          updated_by: ctx.manager?.id || null,
        })
        .select("id,code,name,description,status,created_at,updated_at")
        .single();
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ success: false, error: "A qualification with this code already exists" }, { status: 409 });
        }
        throw error;
      }
      return NextResponse.json({ success: true, qualification: data }, { status: 201 });
    }

    if (action === "grant") {
      const staffId = text(body?.staffId || body?.staff_id);
      const qualificationId = text(body?.qualificationId || body?.qualification_id);
      const validFrom = dateOrNull(body?.validFrom || body?.valid_from, "validFrom");
      const validUntil = dateOrNull(body?.validUntil || body?.valid_until, "validUntil");
      const evidenceReference = text(body?.evidenceReference || body?.evidence_reference);
      if (!staffId || !qualificationId) {
        return NextResponse.json({ success: false, error: "Staff member and qualification are required" }, { status: 400 });
      }
      if (!evidenceReference) {
        return NextResponse.json({ success: false, error: "Evidence reference is required before a qualification can become authoritative" }, { status: 400 });
      }
      if (validFrom && validUntil && validUntil < validFrom) {
        return NextResponse.json({ success: false, error: "Qualification expiry cannot be before its start date" }, { status: 400 });
      }

      const [staffResult, qualificationResult] = await Promise.all([
        supabaseAdmin
          .from("staff_accounts")
          .select("id")
          .eq("active_organization_id", ctx.organizationId)
          .eq("active", true)
          .eq("id", staffId)
          .maybeSingle(),
        supabaseAdmin
          .from("people_qualification_catalog")
          .select("id,status")
          .eq("organization_id", ctx.organizationId)
          .eq("id", qualificationId)
          .maybeSingle(),
      ]);
      if (staffResult.error) throw staffResult.error;
      if (qualificationResult.error) throw qualificationResult.error;
      if (!staffResult.data) return NextResponse.json({ success: false, error: "Staff member is not active in this organization" }, { status: 409 });
      if (!qualificationResult.data || qualificationResult.data.status !== "active") {
        return NextResponse.json({ success: false, error: "Qualification is not active in this organization" }, { status: 409 });
      }

      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("staff_qualifications")
        .upsert({
          organization_id: ctx.organizationId,
          staff_id: staffId,
          qualification_id: qualificationId,
          status: "active",
          valid_from: validFrom,
          valid_until: validUntil,
          evidence_reference: evidenceReference,
          verified_by: ctx.manager?.id || null,
          verified_at: now,
          created_by: ctx.manager?.id || null,
          updated_by: ctx.manager?.id || null,
          updated_at: now,
        }, { onConflict: "organization_id,staff_id,qualification_id" })
        .select("id,staff_id,qualification_id,status,valid_from,valid_until,evidence_reference,verified_at")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, holding: data });
    }

    if (action === "revoke") {
      const holdingId = text(body?.holdingId || body?.holding_id);
      if (!holdingId) return NextResponse.json({ success: false, error: "holdingId is required" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("staff_qualifications")
        .update({
          status: "revoked",
          updated_by: ctx.manager?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", ctx.organizationId)
        .eq("id", holdingId)
        .select("id,status")
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: "Qualification holding not found" }, { status: 404 });
      return NextResponse.json({ success: true, holding: data });
    }

    if (action === "set-qualification-status") {
      const qualificationId = text(body?.qualificationId || body?.qualification_id);
      const status = text(body?.status).toLowerCase();
      if (!qualificationId || !QUALIFICATION_STATUSES.has(status)) {
        return NextResponse.json({ success: false, error: "Qualification and valid status are required" }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin
        .from("people_qualification_catalog")
        .update({ status, updated_by: ctx.manager?.id || null, updated_at: new Date().toISOString() })
        .eq("organization_id", ctx.organizationId)
        .eq("id", qualificationId)
        .select("id,code,name,status")
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: "Qualification not found" }, { status: 404 });
      return NextResponse.json({ success: true, qualification: data });
    }

    return NextResponse.json({ success: false, error: "Unknown qualification action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Unable to change People qualifications",
    }, { status: error?.status || 400 });
  }
}
