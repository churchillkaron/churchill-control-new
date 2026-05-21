import { createServerSupabase } from "@/lib/shared/supabase/server";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export const runtime = "nodejs";



export async function POST(req) {
  try {

const supabase = createServerSupabase();
    // ✅ CORRECT: use formData (not JSON here)
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `uploads/${fileName}`;

    // ✅ UPLOAD TO STORAGE
    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, buffer, {
        contentType: file.type,
      });

    if (uploadError) {
      console.error("UPLOAD ERROR:", uploadError);

      return NextResponse.json(
        { success: false, error: uploadError.message },
        { status: 500 }
      );
    }

    // ✅ GET PUBLIC URL
    const { data } = supabase.storage
      .from("uploads")
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: data.publicUrl,
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);

    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}