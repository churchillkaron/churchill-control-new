import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";

export const runtime = "nodejs";

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
    const audio = formData.get("audio");
    const threadId = formData.get("thread_id");

    if (!audio || !threadId) {
      return NextResponse.json(
        { success: false, error: "audio and thread_id required" },
        { status: 400 }
      );
    }

    const { data: participant, error: participantError } = await supabaseAdmin
      .from("message_participants")
      .select("id")
      .eq("organization_id", identity.organization_id)
      .eq("thread_id", threadId)
      .eq("staff_id", identity.id)
      .maybeSingle();

    if (participantError) {
      throw participantError;
    }

    if (!participant) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const supabase = createServerSupabase();
    const buffer = Buffer.from(await audio.arrayBuffer());
    const path =
      `voice-notes/${identity.organization_id}/${identity.id}/${Date.now()}.webm`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(path, buffer, {
        contentType: "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrl } = supabase.storage
      .from("uploads")
      .getPublicUrl(path);

    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({
        organization_id: identity.organization_id,
        thread_id: threadId,
        sender_id: identity.id,
        content: "Voice Note",
        attachment_url: publicUrl.publicUrl,
      })
      .select(`
        *,
        sender:staff_accounts(
          id,
          name,
          role,
          profile_picture
        )
      `)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: identity.organization_id,
      message,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to save voice note",
      },
      { status: 500 }
    );
  }
}
