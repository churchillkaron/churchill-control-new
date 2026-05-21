export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/shared/supabase/client";

export async function DELETE(

  request,

  { params }

) {

  try {

    const id =
      params.id;

    if (!id) {

      return NextResponse.json(

        {

          success: false,

          error:
            "Missing job id",

        },

        {

          status: 400,

        }

      );

    }

    const {
      error,
    } = await supabase

      .from(
        "generation_jobs"
      )

      .delete()

      .eq(
        "id",
        id
      );

    if (error) {

      console.error(
        "DELETE GENERATION JOB ERROR:",
        error
      );

      return NextResponse.json(

        {

          success: false,

          error,

        },

        {

          status: 500,

        }

      );

    }

    return NextResponse.json({

      success: true,

    });

  } catch (err) {

    console.error(
      "DELETE GENERATION JOB FATAL:",
      err
    );

    return NextResponse.json(

      {

        success: false,

        error:
          err.message,

      },

      {

        status: 500,

      }

    );

  }

}