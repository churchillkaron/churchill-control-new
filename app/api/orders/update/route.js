export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const { id } = body;

    if (!id) {

      return NextResponse.json(
        {
          error:
            "Missing order id",
        },
        {
          status: 400,
        }
      );

    }

    const tenantId =
      await getTenantId();

    if (!tenantId) {

      return NextResponse.json(
        {
          error:
            "Tenant not found",
        },
        {
          status: 401,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      data: order,
      error,
    } = await supabase

      .from("orders")

      .update({

        status:
          "paid",

      })

      .eq(
        "id",
        id
      )

      .eq(
        "tenant_id",
        tenantId
      )

      .select()

      .single();

    if (
      error ||
      !order
    ) {

      console.error(
        "ORDER UPDATE ERROR:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Order not found or update failed",
        },
        {
          status: 404,
        }
      );

    }

    return NextResponse.json({

      success: true,

      order,

    });

  } catch (err) {

    console.error(
      "ORDER UPDATE ERROR:",
      err
    );

    return NextResponse.json(
      {
        error:
          err.message ||
          "Server error",
      },
      {
        status: 500,
      }
    );

  }

}
