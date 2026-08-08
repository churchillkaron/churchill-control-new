import { NextResponse } from "next/server";

import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    const user = await getServerCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
        },
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
        {
          success: false,
          error: "Active staff organization not found",
        },
        { status: 404 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: staff.active_organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        { status: access.status || 403 }
      );
    }

    const organizationId = access.organizationId;

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
