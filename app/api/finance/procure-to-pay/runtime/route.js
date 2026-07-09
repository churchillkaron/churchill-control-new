export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const organizationId =
      searchParams.get("organizationId");

    const access =
      await requireOrganizationAccess({
        organizationId: organizationId,
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

    const [
      vendors,
      purchaseOrders,
      receipts,
      invoices,
      matches,
      payables,
      payments,
    ] = await Promise.all([

      supabaseAdmin
        .from("supplier_profiles")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("purchase_orders")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("goods_receipts")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("vendor_invoices")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("invoice_matches")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("accounts_payable")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

      supabaseAdmin
        .from("vendor_payments")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "organization_id",
          organizationId
        ),

    ]);

    return NextResponse.json({
      success: true,

      vendors:
        vendors.count || 0,

      purchaseOrders:
        purchaseOrders.count || 0,

      receipts:
        receipts.count || 0,

      invoices:
        invoices.count || 0,

      matches:
        matches.count || 0,

      payables:
        payables.count || 0,

      payments:
        payments.count || 0,
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
