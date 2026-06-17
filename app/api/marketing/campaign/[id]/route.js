export const dynamic = "force-dynamic";

import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabaseAdmin =
  getServiceSupabase();

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
    } = await supabaseAdmin
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
