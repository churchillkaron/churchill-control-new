export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

const CONNECTION_TYPES = new Set([
  "TAX_FILING",
  "E_INVOICING",
  "STATUTORY_REPORTING",
  "PAYROLL_REPORTING",
  "CUSTOMS_REPORTING",
  "OTHER",
]);

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (/permission denied|authentication|membership/.test(normalized)) return 403;
  if (/required|not supported|already exists|not found/.test(normalized)) return 400;
  return 500;
}

async function requireFinanceTax(request, organizationId, permissionKey) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return access;

  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey,
    fullAccess: access.permissions?.includes("*") === true,
  });

  return access;
}

async function resolveJurisdiction(organizationId, supplied) {
  const explicit = upper(supplied);
  if (explicit) return explicit;

  const { data, error } = await supabaseAdmin
    .from("finance_organization_profiles")
    .select("country_code, entity_id")
    .eq("organization_id", organizationId)
    .not("country_code", "is", null)
    .order("entity_id", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return upper(data?.country_code);
}

function decorate(row) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    authority_name: row.authority_name,
    connection_type: row.connection_type,
    jurisdiction_code: row.jurisdiction_code || row.country_code || null,
    provider_code: row.provider_code || null,
    managed_by: "AVANTIQO",
    status: row.status || "PENDING_SETUP",
    health_status: row.health_status || "PENDING_CONFIGURATION",
    last_verified_at: row.last_verified_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    name: row.authority_name,
    title: row.authority_name,
    code: row.connection_type,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireFinanceTax(
      request,
      searchParams.get("organizationId") || searchParams.get("organization_id"),
      "finance.tax.view"
    );

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("finance_government_connections")
      .select("id, organization_id, authority_name, connection_type, jurisdiction_code, country_code, provider_code, managed_by, status, health_status, last_verified_at, created_at, updated_at")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const rows = (data || []).map(decorate);

    return NextResponse.json({ success: true, rows, connections: rows });
  } catch (error) {
    const message = error?.message || "Unable to load government connections";
    return NextResponse.json(
      { success: false, error: message, rows: [] },
      { status: statusFor(message) }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireFinanceTax(
      request,
      body.organizationId || body.organization_id,
      "finance.tax.manage"
    );

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const authorityName = required(body.authority_name || body.authorityName, "Authority / Network");
    const connectionType = upper(body.connection_type || body.connectionType);
    if (!CONNECTION_TYPES.has(connectionType)) {
      throw new Error("Connection Purpose is not supported");
    }

    const jurisdictionCode = await resolveJurisdiction(
      access.organizationId,
      body.jurisdiction_code || body.jurisdictionCode
    );
    if (!jurisdictionCode) {
      throw new Error("Jurisdiction required; configure Organization Profile country or provide jurisdiction_code");
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("finance_government_connections")
      .select("id, status")
      .eq("organization_id", access.organizationId)
      .eq("connection_type", connectionType)
      .eq("jurisdiction_code", jurisdictionCode)
      .ilike("authority_name", authorityName);

    if (existingError) throw existingError;
    const activeExisting = (existing || []).find(
      row => !["ARCHIVED", "DISCONNECTED"].includes(upper(row.status))
    );
    if (activeExisting) {
      throw new Error("This government connection request already exists");
    }

    const now = new Date().toISOString();
    const { data: created, error: createError } = await supabaseAdmin
      .from("finance_government_connections")
      .insert({
        organization_id: access.organizationId,
        authority_name: authorityName,
        connection_type: connectionType,
        jurisdiction_code: jurisdictionCode,
        country_code: jurisdictionCode.length === 2 ? jurisdictionCode : null,
        provider_code: null,
        credential_reference: null,
        capabilities: [],
        managed_by: "AVANTIQO",
        status: "PENDING_SETUP",
        health_status: "PENDING_CONFIGURATION",
        last_verified_at: null,
        created_by: access.user?.id || null,
        updated_at: now,
      })
      .select("id, organization_id, authority_name, connection_type, jurisdiction_code, country_code, provider_code, managed_by, status, health_status, last_verified_at, created_at, updated_at")
      .single();

    if (createError) throw createError;

    return NextResponse.json({
      success: true,
      message: "Government connection requested. Avantiqo will configure and verify the compatible managed connection before it is marked connected.",
      record: decorate(created),
    });
  } catch (error) {
    const message = error?.message || "Unable to request government connection";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
