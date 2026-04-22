import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      revenue = 0,
      drinks = 0,
      dinner = 0,
      games = 0,
      topCustomers = 0,
    } = body || {};

    // 🧠 Basic analysis logic (can expand later)
    let situation = "normal";

    if (revenue < 10000) situation = "low_revenue";
    if (drinks > dinner) situation = "drink_focus";
    if (games > 0 && games < drinks) situation = "games_opportunity";
    if (topCustomers > 0) situation = "vip_opportunity";

    return NextResponse.json({
      situation,
      metrics: {
        revenue,
        drinks,
        dinner,
        games,
        topCustomers,
      },
    });

  } catch (err) {
    console.log("ANALYZE ERROR:", err);

    return NextResponse.json(
      { error: "Analyze failed" },
      { status: 500 }
    );
  }
}