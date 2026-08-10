import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import buildPayrollReadiness from "@/lib/payroll/readiness/buildPayrollReadiness";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

// Payroll readiness reads privileged workforce and payroll data on the trusted server.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const READINESS_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
  "HR_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

async function resolveEntityId({ organizationId, requestedEntityId }) {
  if (requestedEntityId) {
    const { data: entity, error } = await supabaseAdmin
      .from("legal_entities")
      .select("id")
      .eq("id", requestedEntityId)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    return entity?.id || null;
  }

  const { data: entity, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("is_default_accounting_entity", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return entity?.id || null;
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds: context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const role = normalizeRole(context.role || context.staff?.role);
    if (!READINESS_ROLES.has(role)) {
      return NextResponse.json(
        { success: false, error: "Payroll readiness permission required" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const payrollMonth = String(url.searchParams.get("payrollMonth") || "").trim();
    const requestedEntityId = url.searchParams.get("entityId") || null;

    if (!/^\d{4}-\d{2}$/.test(payrollMonth)) {
      return NextResponse.json(
        { success: false, error: "payrollMonth must use YYYY-MM format" },
        { status: 400 }
      );
    }

    const entityId = await resolveEntityId({
      organizationId: context.organizationId,
      requestedEntityId,
    });

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "Default legal entity not configured" },
        { status: 400 }
      );
    }

    const readiness = await buildPayrollReadiness({
      organizationId: context.organizationId,
      entityId,
      payrollMonth,
    });

    return NextResponse.json({
      success: true,
      role,
      readiness,
    });
  } catch (error) {
    console.error("PAYROLL_READINESS_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to evaluate payroll readiness",
      },
      { status: 500 }
    );
  }
}
