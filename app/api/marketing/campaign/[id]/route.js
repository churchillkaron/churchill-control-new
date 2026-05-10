import { supabase }
from "@/lib/supabase";

export async function GET(

  request,

  { params }

) {

  try {

    const { id } =
      params;

    const {
      data,
      error,
    } = await supabase
      .from(
        "marketing_campaigns"
      )
      .select("*")
      .eq("id", id)
      .single();

    if (error) {

      return Response.json({

        success: false,

        error:
          error.message,

      });

    }

    return Response.json(
      data
    );

  } catch (err) {

    console.error(
      "GET CAMPAIGN ERROR:",
      err
    );

    return Response.json({

      success: false,

      error:
        err.message,

    });

  }

}