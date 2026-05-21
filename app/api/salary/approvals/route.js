export const dynamic = "force-dynamic";

import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function GET() {

  try {

    const supabase =
      createServerSupabase();

    const {
      data,
      error,
    } = await supabase

      .from("salary_approvals")

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
