import { NextResponse } from "next/server";
import { supabase } from "lib/integrations/supabase.js";

export async function GET() {
  const { data, error } = await supabase
    .from("history_days")
    .select("*")
    .order("day_date", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ level: 5, avgScore: 0 });
  }

  const avgScore = Math.round(
    data.reduce((sum, d) => sum + (d.foh_score || 0), 0) / data.length
  );

  let level = 5;

  if (avgScore >= 80) level = 7;
  else if (avgScore >= 70) level = 6;
  else level = 5;

  return NextResponse.json({
    level,
    avgScore,
    days: data.length,
  });
}