import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import generatePayslipPdf from "@/lib/payroll/payslips/generatePayslipPdf";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(request) {
  try {
    const user = await getServerCurrentUser();

    if (!user) {
      return Response.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,party_id,active_organization_id,active")
      .eq("auth_user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (staffError) throw staffError;

    if (!staff?.active_organization_id) {
      return Response.json(
        { success: false, error: "Active staff organization not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const payrollRecordId = body?.payrollRecordId;

    if (!payrollRecordId) {
      return Response.json(
        { success: false, error: "payrollRecordId required" },
        { status: 400 }
      );
    }

    const { data: record, error: recordError } = await supabaseAdmin
      .from("payroll_records")
      .select("id,party_id,staff_id,organization_id,status")
      .eq("id", payrollRecordId)
      .eq("organization_id", staff.active_organization_id)
      .eq("staff_id", staff.id)
      .maybeSingle();

    if (recordError) throw recordError;

    if (!record) {
      return Response.json(
        { success: false, error: "Payroll record not found for staff member" },
        { status: 404 }
      );
    }

    if (staff.party_id && record.party_id && record.party_id !== staff.party_id) {
      return Response.json(
        { success: false, error: "Payroll record party mismatch" },
        { status: 403 }
      );
    }

    const pdf = await generatePayslipPdf({
      payrollRecordId,
      organizationId: staff.active_organization_id,
      staffId: staff.id,
      partyId: staff.party_id || null,
    });

    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=payslip.pdf",
      },
    });
  } catch (error) {
    console.error("PAYSLIP_ERROR", error);

    return Response.json(
      { success: false, error: error?.message || "Unable to generate payslip" },
      { status: 400 }
    );
  }
}
