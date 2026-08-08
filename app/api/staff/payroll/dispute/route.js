import { NextResponse } from "next/server";

import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import disputePayrollRecord from "@/lib/payroll/consolidation/disputePayrollRecord";
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
      .select("id,name,email,party_id,active_organization_id,active")
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

    const body = await request.json();

    const result = await disputePayrollRecord({
      payrollRecordId: body?.payrollRecordId,
      organizationId: staff.active_organization_id,
      staffId: staff.id,
      partyId: staff.party_id || null,
      staffName: staff.name || staff.email || "STAFF",
      disputeReason: body?.disputeReason,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("PAYROLL_DISPUTE_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to dispute payroll" },
      { status: 400 }
    );
  }
}
