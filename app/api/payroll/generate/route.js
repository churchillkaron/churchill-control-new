import { NextResponse } from "next/server";

import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import generateMonthlyPayroll from "@/lib/payroll/consolidation/generateMonthlyPayroll";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(request) {
  try {
    const user = await getServerCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .eq("auth_user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (staffError) throw staffError;

    if (!staff?.active_organization_id) {
      return NextResponse.json(
        { success: false, error: "Active staff organization not found" },
        { status: 404 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: staff.active_organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
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
        .eq("organization_id", access.organizationId)
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
        .eq("organization_id", access.organizationId)
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
      organizationId: access.organizationId,
      entityId,
      payrollMonth,
      requestedBy: staff.id,
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
