import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET() {
  try {
    const { count, error: countError } = await supabaseAdmin
      .from("customer_loyalty_accounts")
      .select("*", {
        head: true,
        count: "exact",
      });

    const { data, error } = await supabaseAdmin
      .from("customer_loyalty_accounts")
      .select("*")
      .limit(5);

    return NextResponse.json({
      success: true,
      count,
      countError,
      error,
      rows: data,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e.message,
    });
  }
}
