import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // backend only
);

export async function GET() {
  try {
    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const { data, error } = await supabase
      .from("assets")
      .select("uploaded_by, uploaded_by_id")
      .eq("type", "review")
      .gte("created_at", start)
      .lte("created_at", end);

    if (error) {
      console.error(error);
      return NextResponse.json({ success: false });
    }

    // count per staff
    const counts = {};

    data.forEach((item) => {
      const name = item.uploaded_by || "Unknown";

      if (!counts[name]) {
        counts[name] = 0;
      }

      counts[name]++;
    });

    // convert to sorted array
    const leaderboard = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      data: leaderboard,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false });
  }
}