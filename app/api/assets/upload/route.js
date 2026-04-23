import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();

    // 🔥 INCLUDE category + department
    const {
      url,
      note,
      tags,
      uploaded_by,
      category,
      department
    } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "Missing URL" },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Missing category" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("assets")
      .insert([
        {
          url,
          note: note || "",
          tags: tags || [],
          uploaded_by: uploaded_by || "staff",
          type: category === "invoice" ? "invoice" : "photo",
          source: "staff",
          category,                 // 🔥 REQUIRED
          department: department || null, // 🔥 REQUIRED
          status: "pending_approval",
          created_at: new Date().toISOString()
        },
      ])
      .select()
      .single();

    if (error) {
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
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}