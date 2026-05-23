import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export async function GET(req) {

  try {

    const identity =
      await getStaffIdentity(
        req
      );

    if (!identity) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      data:
        participantRows,
    } = await supabase

      .from(
        "message_participants"
      )

      .select(
        "thread_id"
      )

      .eq(
        "staff_id",
        identity.id
      );

    const threadIds =
      participantRows?.map(
        (x) => x.thread_id
      ) || [];

    if (
      threadIds.length === 0
    ) {

      return NextResponse.json({
        success: true,
        unread: 0,
      });

    }

    const {
      data:
        messages,
      error,
    } = await supabase

      .from(
        "messages"
      )

      .select(`
        id,
        sender_id,
        reads:message_reads(
          staff_id
        )
      `)

      .in(
        "thread_id",
        threadIds
      );

    if (error) {

      return NextResponse.json(
        {
          success: false,
          error:
            error.message,
        },
        {
          status: 500,
        }
      );

    }

    let unread = 0;

    for (
      const message
      of messages || []
    ) {

      const mine =
        message.sender_id ===
        identity.id;

      if (mine) continue;

      const alreadyRead =
        message.reads?.find(
          (x) =>
            x.staff_id ===
            identity.id
        );

      if (!alreadyRead) {
        unread++;
      }

    }

    return NextResponse.json({
      success: true,
      unread,
    });

  } catch (err) {

    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      {
        status: 500,
      }
    );

  }

}
