import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function today() {
  return new Date().toISOString().slice(0, 10);
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

    const { staff, organizationId } = context;

    const [partyResult, compensationResult, payrollResult] = await Promise.all([
      staff.party_id
        ? supabaseAdmin
            .from("parties")
            .select("*")
            .eq("id", staff.party_id)
            .eq("organization_id", organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("employee_compensation_profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_account_id", staff.id)
        .lte("effective_from", today())
        .or(`effective_to.is.null,effective_to.gte.${today()}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("payroll_records")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .order("payroll_month", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(24),
    ]);

    if (partyResult.error) throw partyResult.error;
    if (compensationResult.error) throw compensationResult.error;
    if (payrollResult.error) throw payrollResult.error;

    const compensation = compensationResult.data
      ? {
          ...compensationResult.data,
          currency_code: compensationResult.data.currency || null,
        }
      : null;

    return NextResponse.json({
      success: true,
      profile: {
        organizationId,
        availableOrganizationIds: context.availableOrganizationIds || [],
        staff,
        party: partyResult.data || null,
        compensation,
        payroll: payrollResult.data || [],
      },
    });
  } catch (error) {
    console.error("STAFF_PROFILE_OVERVIEW_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load staff profile",
      },
      { status: 500 }
    );
  }
}
