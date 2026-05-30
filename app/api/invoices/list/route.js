export const dynamic = "force-dynamic";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function GET() {

  try {

    const supabase =
      supabaseAdmin;

    const {
      data,
      error,
    } = await supabase

      .from("invoices")

      .select("*")

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
