export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const tenantId = searchParams.get("tenantId");
    const status = searchParams.get("status");

    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: "tenantId required",
        },
        {
          status: 400,
        }
      );
    }

    let query = supabaseAdmin
      .from("approval_requests")
      .select(`
        *,
        approval_workflows (
          id,
          workflow_type,
          department,
          minimum_role,
          approval_steps
        )
      `)
      .eq("tenant_id", tenantId);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query.order(
      "created_at",
      { ascending: false }
    );

    if (error) {
      throw error;
    }

    const requests = [];

    for (const req of data || []) {

      let approvalData = null;

      if (
        req.reference_table ===
        "payroll_records"
      ) {

        const {
          data: payroll,
        } = await supabaseAdmin
          .from("payroll_records")
          .select(`
            id,
            staff_name,
            role,
            payroll_month,
            final_salary,
            department_cost_center,
            review_required,
            review_reason
          `)
          .eq(
            "id",
            req.reference_id
          )
          .maybeSingle();

        if (payroll) {

          approvalData = {
            type: "payroll",
            title: "Payroll Approval",
            staff_name:
              payroll.staff_name,
            role:
              payroll.role,
            payroll_month:
              payroll.payroll_month,
            final_salary:
              payroll.final_salary,
            department:
              payroll.department_cost_center,
            review_required:
              payroll.review_required,
            review_reason:
              payroll.review_reason,
          };

        }

      }

      requests.push({
        ...req,
        approvalData,
      });

    }

    return NextResponse.json({
      success: true,
      requests,
    });

  } catch (error) {

    console.error(
      "APPROVAL_REQUESTS_ERROR",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }
}
