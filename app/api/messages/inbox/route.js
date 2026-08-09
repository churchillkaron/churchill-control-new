import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";

export async function GET(request) {
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

    const { data: participantRows, error: participantError } =
      await supabaseAdmin
        .from("message_participants")
        .select("thread_id")
        .eq("organization_id", identity.organization_id)
        .eq("staff_id", identity.id);

    if (participantError) {
      throw participantError;
    }

    const threadIds = (participantRows || []).map(
      (row) => row.thread_id
    );

    if (!threadIds.length) {
      return NextResponse.json({
        success: true,
        organizationId: identity.organization_id,
        threads: [],
      });
    }

    const { data: threads, error: threadError } = await supabaseAdmin
      .from("message_threads")
      .select(`
        id,
        title,
        type,
        created_at,
        updated_at,
        messages(
          id,
          content,
          created_at,
          sender_id,
          message_reads(
            staff_id,
            read_at
          )
        )
      `)
      .eq("organization_id", identity.organization_id)
      .in("id", threadIds);

    if (threadError) {
      throw threadError;
    }

    const enriched = (threads || []).map((thread) => {
      const messages = thread.messages || [];
      const sorted = [...messages].sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
      const latest = sorted[0] || null;

      const unreadCount = messages.reduce((count, message) => {
        if (message.sender_id === identity.id) {
          return count;
        }

        const readByCurrentStaff = (message.message_reads || []).some(
          (read) => read.staff_id === identity.id && read.read_at
        );

        return readByCurrentStaff ? count : count + 1;
      }, 0);

      return {
        ...thread,
        latest_message: latest?.content || "",
        latest_created_at: latest?.created_at || null,
        unread_count: unreadCount,
      };
    });

    enriched.sort(
      (a, b) =>
        new Date(
          b.latest_created_at || b.updated_at || b.created_at
        ).getTime() -
        new Date(
          a.latest_created_at || a.updated_at || a.created_at
        ).getTime()
    );

    return NextResponse.json({
      success: true,
      organizationId: identity.organization_id,
      threads: enriched,
    });
  } catch (error) {
    console.error("MESSAGE_INBOX_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load inbox",
      },
      { status: 500 }
    );
  }
}
