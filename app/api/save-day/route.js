import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function normalizeBusinessDate(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

export async function POST(request) {
  try {
    const body = await request.json();

    const date = normalizeBusinessDate(body?.date);
    const dishes =
      typeof body?.dishes === "string"
        ? body.dishes
        : JSON.stringify(body?.dishes || {});
    const revenue = Number(body?.revenue || 0);
    const cost = Number(body?.cost || 0);
    const profit = Number(body?.profit || 0);

    const { data: existingRow, error: existingError } = await supabase
      .from("daily-reports")
      .select("id")
      .eq("date", date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingRow?.id) {
      const { data, error } = await supabase
        .from("daily-reports")
        .update({
          date,
          dishes,
          revenue,
          cost,
          profit,
        })
        .eq("id", existingRow.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        mode: "updated",
        data,
      });
    }

    const { data, error } = await supabase
      .from("daily-reports")
      .insert([
        {
          date,
          dishes,
          revenue,
          cost,
          profit,
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      mode: "inserted",
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.message || "Failed to save day.",
      },
      { status: 500 }
    );
  }
}