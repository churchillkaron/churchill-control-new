import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {

  try {

    console.log("GET QUEUE");

    const { data, error } = await supabase
      .from("campaign_publish_queue")
      .select(`
        *,
        campaign_memory (*)
      `)
      .order("created_at", {
        ascending: false,
      });

    console.log("QUEUE DATA:", data);

    console.log("QUEUE ERROR:", error);

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

    console.log("QUEUE CRASH:", err);

    return NextResponse.json(
      {
        error:
          err.message ||
          "Load queue failed",
      },
      { status: 500 }
    );

  }

}

export async function POST(req) {

  try {

    const body = await req.json();

    console.log("QUEUE INSERT BODY:", body);

    const { data, error } = await supabase
      .from("campaign_publish_queue")
      .insert([
        {
          campaign_memory_id:
            body.campaign_memory_id,

          platform:
            body.platform || "facebook",

          scheduled_at:
            body.scheduled_at || null,

          status: "pending",
        },
      ])
      .select()
      .single();

    console.log("INSERT DATA:", data);

    console.log("INSERT ERROR:", error);

    if (error) {

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );

    }

    return NextResponse.json({
      success: true,
      queue: data,
    });

  } catch (err) {

    console.log("QUEUE INSERT CRASH:", err);

    return NextResponse.json(
      {
        error:
          err.message ||
          "Queue failed",
      },
      { status: 500 }
    );

  }

}