export const dynamic = "force-dynamic";
import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function GET(request) {

  try {

    await requireAuth();
    const { searchParams } = new URL(request.url);

    const organizationId =
      searchParams.get("organizationId");

    const access =
      await requireOrganizationAccess({

        organizationId:
          organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    

    const [
      invoicesResult,
      poResult,
      grnResult,
      matchesResult,
    ] = await Promise.all([

      supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("organization_id", organizationId)
        .in("status", [
          "approved",
          "paid",
        ])
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),

      supabaseAdmin
        .from("purchase_orders")
        .select("*")
        .eq("organization_id", organizationId)
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),

      supabaseAdmin
        .from("goods_receipts")
        .select("*")
        .eq("organization_id", organizationId)
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),

      supabaseAdmin
        .from("invoice_matches")
        .select("*")
        .eq("organization_id", organizationId)
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),

    ]);

    return NextResponse.json({

      success: true,

      invoices:
        invoicesResult.data || [],

      purchaseOrders:
        poResult.data || [],

      goodsReceipts:
        grnResult.data || [],

      matches:
        matchesResult.data || [],

    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}
