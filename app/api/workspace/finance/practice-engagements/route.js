export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.configuration.manage"];

function clean(value) {
  return String(value ?? "").trim();
}

function nullable(value) {
  const normalized = clean(value);
  return normalized || null;
}

function nullableDate(value) {
  const normalized = nullable(value);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const error = new Error("Dates must use YYYY-MM-DD");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const error = new Error("Invalid numeric value");
    error.status = 400;
    throw error;
  }
  return parsed;
}

function jsonError(error, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
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
  throw lastError || new Error("Finance accounting management permission denied");
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accountingFirmId = clean(body.organizationId || body.organization_id);
    const clientOrganizationId = clean(body.clientOrganizationId || body.client_organization_id);

    if (!accountingFirmId) return jsonError("Accounting firm organization is required", 400);
    if (!clientOrganizationId) return jsonError("Client organization is required", 400);
    if (accountingFirmId === clientOrganizationId) return jsonError("Select a client organization different from the accounting firm", 400);

    const firmAccess = await requireOrganizationAccess({
      organizationId: accountingFirmId,
      request,
    });
    if (!firmAccess.success) return jsonError(firmAccess.error, firmAccess.status || 403);
    await requireManage(firmAccess);

    const clientAccess = await requireOrganizationAccess({
      organizationId: clientOrganizationId,
      request,
    });
    if (!clientAccess.success) {
      return jsonError(
        "You no longer have access to the selected client organization. Refresh the client list and choose an accessible organization.",
        403,
      );
    }

    const { data: clientOrganization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("id,name,status,organization_status")
      .eq("id", clientAccess.organizationId)
      .maybeSingle();
    if (organizationError) throw organizationError;
    if (!clientOrganization) return jsonError("Client organization not found", 404);

    const organizationStatus = clean(clientOrganization.organization_status || clientOrganization.status).toUpperCase();
    if (["INACTIVE", "DISABLED", "SUSPENDED", "TERMINATED", "ARCHIVED"].includes(organizationStatus)) {
      return jsonError("Inactive organizations cannot be added as accounting clients", 409);
    }

    const entityId = nullable(body.entityId || body.entity_id);
    if (entityId) {
      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("id", entityId)
        .eq("organization_id", clientAccess.organizationId)
        .eq("is_active", true)
        .maybeSingle();
      if (entityError) throw entityError;
      if (!entity) return jsonError("Selected legal entity is not active in the selected client organization", 409);
    }

    const billingDay = Math.trunc(number(body.billingDay ?? body.billing_day, 1));
    if (billingDay < 1 || billingDay > 28) return jsonError("Billing day must be between 1 and 28", 400);

    const monthlyFee = number(body.monthlyFee ?? body.monthly_fee, 0);
    if (monthlyFee < 0) return jsonError("Monthly fee cannot be negative", 400);

    const { data: result, error: createError } = await supabaseAdmin.rpc(
      "accounting_create_client_engagement_atomic",
      {
        p_accounting_firm_id: firmAccess.organizationId,
        p_client_organization_id: clientAccess.organizationId,
        p_entity_id: entityId,
        p_service_package: nullable(body.servicePackage || body.service_package),
        p_monthly_fee: monthlyFee,
        p_billing_day: billingDay,
        p_start_date: nullableDate(body.startDate || body.start_date),
        p_contract_start_date: nullableDate(body.contractStartDate || body.contract_start_date),
        p_renewal_date: nullableDate(body.renewalDate || body.renewal_date),
        p_year_end_date: nullableDate(body.yearEndDate || body.year_end_date),
        p_accounting_standard: clean(body.accountingStandard || body.accounting_standard || "TFRS").toUpperCase(),
        p_vat_frequency: clean(body.vatFrequency || body.vat_frequency || "MONTHLY").toUpperCase(),
        p_payroll_frequency: clean(body.payrollFrequency || body.payroll_frequency || "MONTHLY").toUpperCase(),
        p_bookkeeping_enabled: bool(body.bookkeepingEnabled ?? body.bookkeeping_enabled, true),
        p_vat_enabled: bool(body.vatEnabled ?? body.vat_enabled, true),
        p_payroll_enabled: bool(body.payrollEnabled ?? body.payroll_enabled, false),
        p_tax_enabled: bool(body.taxEnabled ?? body.tax_enabled, true),
        p_reporting_enabled: bool(body.reportingEnabled ?? body.reporting_enabled, true),
        p_audit_enabled: bool(body.auditEnabled ?? body.audit_enabled, false),
        p_contact_name: nullable(body.contactName || body.contact_name),
        p_contact_email: nullable(body.contactEmail || body.contact_email),
        p_contact_phone: nullable(body.contactPhone || body.contact_phone),
        p_tax_id: nullable(body.taxId || body.tax_id),
        p_vat_number: nullable(body.vatNumber || body.vat_number),
        p_position: nullable(body.position),
        p_whatsapp: nullable(body.whatsapp),
      },
    );

    if (createError) {
      if (/function .* does not exist|schema cache/i.test(createError.message || "")) {
        const error = new Error("Accounting client creation migration is not installed in this environment");
        error.status = 503;
        throw error;
      }
      throw createError;
    }

    const created = result?.created === true || result?.status === "CREATED";
    return NextResponse.json(
      {
        success: true,
        result,
        client: {
          organization_id: clientOrganization.id,
          name: clientOrganization.name,
        },
      },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    console.error("FINANCE_PRACTICE_ENGAGEMENT_CREATE_FAILED", error);
    const message = error?.message || "Unable to create accounting client engagement";
    const status =
      error?.status ||
      (/permission denied|access denied/i.test(message) ? 403 : 500);
    return jsonError(message, status);
  }
}
