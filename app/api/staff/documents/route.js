import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";

export const runtime = "nodejs";

export async function GET(req) {
  const supabase = createServerSupabase();
  const { searchParams } = new URL(req.url);

  const tenant_id = searchParams.get("tenant_id");
  const staff_id = searchParams.get("staff_id");

  let query = supabase
    .from("staff_documents")
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false });

  if (staff_id) query = query.eq("staff_id", staff_id);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, documents: data || [] });
}

export async function POST(req) {
  try {
    const supabase = createServerSupabase();
    const formData = await req.formData();

    const file = formData.get("file");
    const tenant_id = formData.get("tenant_id");
    const staff_id = formData.get("staff_id");
    const category = formData.get("category") || "staff";
    const visibility = formData.get("visibility") || "private";

    if (!file || !tenant_id) {
      return NextResponse.json({ success: false, error: "Missing file or tenant_id" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = `staff-documents/${tenant_id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: publicData } = supabase.storage
      .from("uploads")
      .getPublicUrl(filePath);

    const { data, error } = await supabase
      .from("staff_documents")
      .insert({
        tenant_id,
        staff_id: staff_id || null,
        title: file.name,
        file_url: publicData.publicUrl,
        file_type: file.type,
        category,
        visibility,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, document: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
