export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";



export async function POST(req) {
  try {
    const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
    // ✅ THIS ROUTE USES JSON (NOT formData)
    const body = await req.json();

    const {
  url,
  note,
  category,
  department,
  uploaded_by,
  uploaded_by_id,
  source,
  type,
  status,
  invoice_status, // ✅ ADD THIS
} = body;

const { data, error } = await supabase
  .from("assets")
  .insert([
    {
      url,
      note: note || "",
      category,
      department,
      uploaded_by,
      uploaded_by_id,
      source,
      type,
      status: status || "pending",
      invoice_status: invoice_status || null, // ✅ SAVE IT
      created_at: new Date().toISOString(),
    },
  ])
  .select()
  .single();
    if (error) {
      console.error("DB INSERT ERROR:", error);

      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      asset: data,
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);

    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}