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

export async function POST(req) {

  try {

    await requireAuth();

    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

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

    const tenantId =
      access.tenantId;

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
