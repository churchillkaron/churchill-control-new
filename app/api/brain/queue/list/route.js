import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {

  try {

    console.log("LOAD QUEUE LIST");

    const { data, error } = await supabase
      .from("campaign_publish_queue")
      .select(`
        *,
        campaign_memory (*)
      `)
      .order("created_at", {
        ascending: false,
      });

    console.log("QUEUE LIST DATA:", data);

    console.log("QUEUE LIST ERROR:", error);

    if (error) {

      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      );

    }

    return NextResponse.json({
      success: true,
      queue: data || [],
    });

  } catch (err) {

    console.log(
      "QUEUE LIST CRASH:",
      err
    );

    return NextResponse.json(
      {
        error:
          err.message ||
          "Queue list failed",
      },
      { status: 500 }
    );

  }

}