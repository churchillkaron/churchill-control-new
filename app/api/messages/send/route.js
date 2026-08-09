import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";

export async function POST(request) {
  try {
    const identity = await getStaffIdentity(request);

    if (!identity?.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const threadId = body?.thread_id || null;
    const content = body?.content || "";
    const attachmentUrl = body?.attachment_url || null;

    if (!threadId || (!content && !attachmentUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: "Message content or attachment required",
        },
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
        {
          success: false,
          error: "Forbidden",
        },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({
        organization_id: identity.organization_id,
        thread_id: threadId,
        sender_id: identity.id,
        content,
        attachment_url: attachmentUrl,
      })
      .select(`
        *,
        sender:staff_accounts(
          id,
          name,
          role,
          profile_picture
        ),
        reads:message_reads(
          id,
          staff_id,
          read_at
        )
      `)
      .single();

    if (error) {
      throw error;
    }

    const { error: threadUpdateError } = await supabaseAdmin
      .from("message_threads")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId)
      .eq("organization_id", identity.organization_id);

    if (threadUpdateError) {
      throw threadUpdateError;
    }

    return NextResponse.json({
      success: true,
      organizationId: identity.organization_id,
      message: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to send message",
      },
      { status: 500 }
    );
  }
}
