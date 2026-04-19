import { NextResponse } from "next/server";
import { supabase } from "../../../lib/integrations/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("history_days")
    .select("*")
    .order("day_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      date,
      revenue,
      servicePool,
      payoutPool,
      payoutStatus,
      fohScore,
      barScore,
      kitchenScore,
      staff,
    } = body;

    if (!date || !revenue || !staff) {
      return NextResponse.json(
        { error: "Missing required data" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("history_days").insert({
      day_date: date,
      revenue,
      service_pool: servicePool,
      payout_pool: payoutPool,
      payout_status: payoutStatus,
      foh_score: fohScore,
      bar_score: barScore,
      kitchen_score: kitchenScore,
      staff_data: staff,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save history" },
      { status: 500 }
    );
  }
}