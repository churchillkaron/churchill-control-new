import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("daily-reports")
      .select("date, revenue, cost, profit, dishes")
      .order("date", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch history." },
        { status: 500 }
      );
    }

    const cleaned = (data || []).map((row) => ({
      date: row.date,
      revenue: Number(row.revenue || 0),
      cost: Number(row.cost || 0),
      profit: Number(row.profit || 0),
      dishes: Array.isArray(row.dishes) ? row.dishes : [],
    }));

    return NextResponse.json(cleaned, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}