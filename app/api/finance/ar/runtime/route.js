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

    const [
      invoices,
      receivables,
      payments,
      overdue,
    ] = await Promise.all([

      supabaseAdmin
        .from("customer_invoices")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("accounts_receivable")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("customer_payments")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("accounts_receivable")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        )
        .gt(
          "due_date",
          "1900-01-01"
        )
        .neq(
          "status",
          "paid"
        ),

    ]);

    return NextResponse.json({
      success: true,

      invoices:
        invoices.count || 0,

      receivables:
        receivables.count || 0,

      payments:
        payments.count || 0,

      overdue:
        overdue.count || 0,
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
