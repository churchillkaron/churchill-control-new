import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

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

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("accounts_payable")

      .select(`
        *,
        vendors (
          id,
          display_name,
          legal_name
        )
      `)

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "status",
        "PENDING_PAYMENT"
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      payables:
        data || [],
    });

  } catch (error) {

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
