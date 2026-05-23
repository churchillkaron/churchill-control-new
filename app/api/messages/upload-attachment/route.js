import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export const runtime = "nodejs";

export async function POST(req) {

  try {

    const identity =
      await getStaffIdentity();

    if (!identity) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase =
      createServerSupabase();

    const formData =
      await req.formData();

    const file =
      formData.get("file");

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const buffer =
      Buffer.from(await file.arrayBuffer());

    const path =
      `message-attachments/${identity.tenant_id}/${Date.now()}-${file.name}`;

    const { error } =
      await supabase.storage
        .from("uploads")
        .upload(path, buffer, {
          contentType: file.type,
          upsert: true,
        });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const { data } =
      supabase.storage
        .from("uploads")
        .getPublicUrl(path);

    return NextResponse.json({
      success: true,
      url: data.publicUrl,
      name: file.name,
      type: file.type,
    });

  } catch (err) {

    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );

  }

}
