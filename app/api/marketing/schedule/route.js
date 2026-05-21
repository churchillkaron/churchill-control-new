export const dynamic = "force-dynamic";

import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function POST(req) {

  const supabase =
    createServerSupabase();

  try {

    const {
      image,
      caption,
      hashtags,
      platform,
    } = await req.json();

    const {
      data,
      error,
    } = await supabase

      .from(
        "marketing_campaigns"
      )

      .insert([
        {
          image,
          caption,
          hashtags,
          platform,
          status: "draft",
        },
      ])

      .select()

      .single();

    if (error) {
      throw error;
    }

    return Response.json({

      success: true,

      data,

    });

  } catch (err) {

    console.error(err);

    return Response.json(

      {
        error:
          "Failed to save campaign",
      },

      {
        status: 500,
      }

    );

  }

}
