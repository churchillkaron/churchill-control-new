import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import generateMonthlyPayroll from "@/lib/payroll/consolidation/generateMonthlyPayroll";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const GENERATE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

export async function POST(request) {
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

    if (!GENERATE_ROLES.has(role)) {
      return NextResponse.json(
        { success: false, error: "Payroll generation permission required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const payrollMonth = String(body?.payrollMonth || "").trim();

    if (!/^\d{4}-\d{2}$/.test(payrollMonth)) {
      return NextResponse.json(
        { success: false, error: "payrollMonth must use YYYY-MM format" },
        { status: 400 }
      );
    }

    let entityId = body?.entityId || null;

    if (entityId) {
      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("id", entityId)
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .maybeSingle();

      if (entityError) throw entityError;

      if (!entity) {
        return NextResponse.json(
          { success: false, error: "Legal entity does not belong to organization" },
          { status: 400 }
        );
      }
    } else {
      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .eq("is_default_accounting_entity", true)
        .limit(1)
        .maybeSingle();

      if (entityError) throw entityError;
      entityId = entity?.id || null;
    }

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "Default legal entity not configured" },
        { status: 400 }
      );
    }

    const result = await generateMonthlyPayroll({
      organizationId: context.organizationId,
      entityId,
      payrollMonth,
      requestedBy: context.staff.id,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("PAYROLL_GENERATE_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to generate payroll",
      },
      { status: 500 }
    );
  }
}
