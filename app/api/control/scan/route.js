export const dynamic = "force-dynamic";

import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

export async function GET() {

  try {

    const tenantId =
      await getTenantId();

    if (!tenantId) {

      return Response.json(
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

    const supabase =
      createServerSupabase();

    const {
      data,
      error,
    } = await supabase

      .from("control_logs")

      .select("*")

      .eq(
        "tenant_id",
        tenantId
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

    return Response.json({

      success: true,

      data,

    });

  } catch (error) {

    console.error(error);

    return Response.json(

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
