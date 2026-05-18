import { NextResponse } from "next/server";

import { createClient }
from "@supabase/supabase-js";

const supabase =
  createClient(

    process.env.NEXT_PUBLIC_SUPABASE_URL,

    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

export async function GET() {

  const {
    data,
    error,
  } = await supabase

    .from("orders")

    .select(`
      *,
      kitchen_ticket_items (
        id,
        status
      )
    `)

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(20);

  if (error) {

    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }

  return NextResponse.json({
    success: true,
    data,
  });
}
