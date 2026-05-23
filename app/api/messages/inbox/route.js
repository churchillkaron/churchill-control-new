import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export async function GET() {

  try {

    const identity =
      await getStaffIdentity();

    if (!identity) {

      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      data: participantRows,
      error: participantError,
    } = await supabase

      .from(
        "message_participants"
      )

      .select(
        "thread_id"
      )

      .eq(
        "tenant_id",
        identity.tenant_id
      )

      .eq(
        "staff_id",
        identity.id
      );

    if (
      participantError
    ) {

      console.error(
        "PARTICIPANT ERROR",
        participantError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            participantError.message,
        },
        {
          status: 500,
        }
      );

    }

    const threadIds =
      participantRows?.map(
        (x) => x.thread_id
      ) || [];

    if (
      threadIds.length === 0
    ) {

      return NextResponse.json({
        success: true,
        threads: [],
      });

    }

    const {
      data: threads,
      error,
    } = await supabase

      .from(
        "message_threads"
      )

      .select(`
        id,
        title,
        type,
        created_at,
        messages(
          id,
          content,
          created_at,
          sender_id
        )
      `)

      .in(
        "id",
        threadIds
      );

    if (error) {

      console.error(
        "THREAD ERROR",
        error
      );

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

    const enriched =
      (threads || []).map(
        (thread) => {

          const sorted =
            [...(
              thread.messages || []
            )].sort(
              (a, b) =>
                new Date(
                  b.created_at
                ) -
                new Date(
                  a.created_at
                )
            );

          const latest =
            sorted[0];

          let unread = 0;

          for (
            const message
            of thread.messages || []
          ) {

            if (
              message.sender_id !==
              identity.id
            ) {

              unread++;

            }

          }

          return {

            ...thread,

            latest_message:
              latest?.content || "",

            latest_created_at:
              latest?.created_at || null,

            unread_count:
              unread,

          };

        }
      );

    return NextResponse.json({
      success: true,
      threads: enriched,
    });

  } catch (err) {

    console.error(
      "INBOX ERROR",
      err
    );

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
