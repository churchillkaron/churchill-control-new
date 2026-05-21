export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function POST(
  request
) {

  try {

    const supabase =
      createServerSupabase();

    const body =
      await request.json();

    const {
      id,
      updates,
    } = body;

    const {
      data,
      error,
    } = await supabase

      .from("assets")

      .update(updates)

      .eq("id", id)

      .select()

      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      data,

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
