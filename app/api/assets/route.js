import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Force dynamic (no caching)
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// GET ALL ASSETS
// =========================
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("ASSETS ERROR:", error);
      return NextResponse.json([], {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(data || [], {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return NextResponse.json([], {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}