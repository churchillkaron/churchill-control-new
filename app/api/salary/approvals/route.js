export const dynamic = "force-dynamic";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const GOVERNANCE_ROLES = new Set([
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

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });

    if (!context.success) {
      return Response.json(
        {
          success: false,
          error: context.error,
          code: context.code,
        },
        { status: context.status || 403 }
      );
    }

    const role = normalizeRole(context.role || context.staff?.role);

    if (!GOVERNANCE_ROLES.has(role)) {
      return Response.json(
        {
          success: false,
          error: "Payroll governance permission required",
        },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("payroll_records")
      .select("*")
      .eq("organization_id", context.organizationId)
      .order("payroll_month", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({
      success: true,
      deprecated: true,
      replacement: "/api/payroll/governance",
      organizationId: context.organizationId,
      role,
      data: data || [],
    });
  } catch (error) {
    console.error("LEGACY_SALARY_APPROVALS_ERROR", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "Unable to load payroll governance",
      },
      { status: 500 }
    );
  }
}
