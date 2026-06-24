import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {

    const body = await req.json();

    const access =
      await requireOrganizationAccess({
        organizationId: body.organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const organizationId =
      body.organizationId;

    const {
      data: reports,
      error,
    } = await supabaseAdmin
      .from("finance_tax_reports")
      .select("*")
      .eq(
        "organization_id",
        organizationId
      );

    if (error) {
      throw error;
    }

    const rows = reports || [];

    const pendingFiling =
      rows.filter(
        r =>
          r.status === "PENDING" ||
          r.status === "DRAFT"
      ).length;

    const reportsAwaitingReview =
      rows.filter(
        r =>
          r.status === "REVIEW"
      ).length;

    const totalTaxPayable =
      rows.reduce(
        (sum, r) =>
          sum +
          Number(
            r.tax_payable || 0
          ),
        0
      );

    const totalOutputTax =
      rows.reduce(
        (sum, r) =>
          sum +
          Number(
            r.output_tax || 0
          ),
        0
      );

    const totalInputTax =
      rows.reduce(
        (sum, r) =>
          sum +
          Number(
            r.input_tax || 0
          ),
        0
      );

    return NextResponse.json({
      success: true,

      reports:
        rows.length,

      pendingFiling,

      reportsAwaitingReview,

      taxPayable:
        totalTaxPayable,

      outputTax:
        totalOutputTax,

      inputTax:
        totalInputTax,
    });

  } catch (error) {

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
