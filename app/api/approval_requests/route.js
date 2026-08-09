export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");
    const status = searchParams.get("status");

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        { status: access.status }
      );
    }

    const resolvedOrganizationId = access.organizationId;

    let query = supabaseAdmin
      .from("approval_requests")
      .select(`
        *,
        approval_workflows (
          id,
          workflow_type,
          department,
          minimum_role,
          approval_steps,
          organization_id
        )
      `)
      .eq("organization_id", resolvedOrganizationId);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      throw error;
    }

    const requests = [];

    for (const approvalRequest of data || []) {
      if (
        approvalRequest.approval_workflows?.organization_id &&
        approvalRequest.approval_workflows.organization_id !==
          resolvedOrganizationId
      ) {
        continue;
      }

      let approvalData = null;

      if (approvalRequest.reference_table === "payroll_records") {
        const { data: payroll, error: payrollError } = await supabaseAdmin
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
          .eq("id", approvalRequest.reference_id)
          .eq("organization_id", resolvedOrganizationId)
          .maybeSingle();

        if (payrollError) {
          throw payrollError;
        }

        if (payroll) {
          approvalData = {
            type: "payroll",
            title: "Payroll Approval",
            staff_name: payroll.staff_name,
            role: payroll.role,
            payroll_month: payroll.payroll_month,
            final_salary: payroll.final_salary,
            department: payroll.department_cost_center,
            review_required: payroll.review_required,
            review_reason: payroll.review_reason,
          };
        }
      }

      requests.push({
        ...approvalRequest,
        approvalData,
      });
    }

    return NextResponse.json({
      success: true,
      organizationId: resolvedOrganizationId,
      requests,
    });
  } catch (error) {
    console.error("APPROVAL_REQUESTS_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load approval requests",
      },
      { status: 500 }
    );
  }
}
