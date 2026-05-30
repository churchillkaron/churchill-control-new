import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function POST() {

  try {

    await requireAuth();

    const tenantId =
      await getTenantId();

    if (!tenantId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Tenant not found",
        },
        {
          status: 401,
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
        .eq("tenant_id", tenantId)
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
        .eq("tenant_id", tenantId)
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),

      supabaseAdmin
        .from("goods_receipts")
        .select("*")
        .eq("tenant_id", tenantId)
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),

      supabaseAdmin
        .from("invoice_matches")
        .select("*")
        .eq("tenant_id", tenantId)
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
