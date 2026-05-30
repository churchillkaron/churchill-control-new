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

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("cost_centers")

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .order(
        "code",
        {
          ascending: true,
        }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      costCenters:
        data || [],

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
