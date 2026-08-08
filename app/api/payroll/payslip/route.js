import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import generatePayslipPdf from "@/lib/payroll/payslips/generatePayslipPdf";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });

    if (!context.success) {
      return Response.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds: context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
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

    const { staff, organizationId } = context;

    const { data: record, error: recordError } = await supabaseAdmin
      .from("payroll_records")
      .select("id,party_id,staff_id,organization_id,status")
      .eq("id", payrollRecordId)
      .eq("organization_id", organizationId)
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
      organizationId,
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
