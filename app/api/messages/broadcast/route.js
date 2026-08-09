import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";

export async function POST(request) {
  try {
    const identity = await getStaffIdentity(request);

    if (!identity?.organization_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const title = body?.title || "Organization Broadcast";
    const content = String(body?.content || "").trim();

    if (!content) {
      return NextResponse.json(
        { success: false, error: "Content required" },
        { status: 400 }
      );
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id")
      .eq("active_organization_id", identity.organization_id)
      .eq("active", true);

    if (staffError) {
      throw staffError;
    }

    const { data: thread, error: threadError } = await supabaseAdmin
      .from("message_threads")
      .insert({
        organization_id: identity.organization_id,
        created_by: identity.id,
        title,
        type: "broadcast",
      })
      .select("*")
      .single();

    if (threadError) {
      throw threadError;
    }

    const participantRows = (staff || []).map((member) => ({
      organization_id: identity.organization_id,
      thread_id: thread.id,
      staff_id: member.id,
    }));

    if (participantRows.length) {
      const { error: participantError } = await supabaseAdmin
        .from("message_participants")
        .insert(participantRows);

      if (participantError) {
        await supabaseAdmin
          .from("message_threads")
          .delete()
          .eq("id", thread.id)
          .eq("organization_id", identity.organization_id);

        throw participantError;
      }
    }

    const { data: message, error: messageError } = await supabaseAdmin
      .from("messages")
      .insert({
        organization_id: identity.organization_id,
        thread_id: thread.id,
        sender_id: identity.id,
        content,
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

    if (messageError) {
      throw messageError;
    }

    return NextResponse.json({
      success: true,
      organizationId: identity.organization_id,
      thread,
      message,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to send organization broadcast",
      },
      { status: 500 }
    );
  }
}
