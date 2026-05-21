export const dynamic = "force-dynamic";

import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

const tenant_id =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export async function GET() {

  try {

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
        tenant_id
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
