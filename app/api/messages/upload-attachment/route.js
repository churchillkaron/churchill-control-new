import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";

export const runtime = "nodejs";

function safeFileName(value) {
  return String(value || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 160);
}

export async function POST(request) {
  try {
    const identity = await getStaffIdentity(request);

    if (!identity?.organization_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const path =
      `message-attachments/${identity.organization_id}/${identity.id}/` +
      `${Date.now()}-${safeFileName(file.name)}`;

    const { error } = await supabase.storage
      .from("uploads")
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage
      .from("uploads")
      .getPublicUrl(path);

    return NextResponse.json({
      success: true,
      organizationId: identity.organization_id,
      url: data.publicUrl,
      name: file.name,
      type: file.type,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to upload attachment",
      },
      { status: 500 }
    );
  }
}
