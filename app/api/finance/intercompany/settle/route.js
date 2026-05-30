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

export async function POST(req) {

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

    const body =
      await req.json();

    const {
      data: transaction,
      error: loadError,
    } = await supabaseAdmin

      .from("intercompany_transactions")

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "id",
        body.transaction_id
      )

      .single();

    if (loadError || !transaction) {
      throw new Error(
        "TRANSACTION_NOT_FOUND"
      );
    }

    if (
      transaction.status ===
      "settled"
    ) {

      throw new Error(
        "TRANSACTION_ALREADY_SETTLED"
      );

    }

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("intercompany_transactions")

      .update({

        status:
          "settled",

        settled_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),

      })

      .eq(
        "id",
        transaction.id
      )

      .select()

      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      transaction:
        data,

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
