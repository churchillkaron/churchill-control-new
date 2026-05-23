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
      error:
        participantError,
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
        identity,
        threads: [],
      });

    }

    const {
      data:
        threads,
      error,
    } = await supabase

      .from(
        "message_threads"
      )

      .select(`
        *,
        messages(
          id,
          content,
          created_at,
          sender_id,
          reads:message_reads(
            staff_id
          )
        )
      `)

      .in(
        "id",
        threadIds
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
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

    const enriched =
      (threads || []).map(
        (thread) => {

          const latest =
            [...(thread.messages || [])]

              .sort(
                (a, b) =>
                  new Date(
                    b.created_at
                  ) -
                  new Date(
                    a.created_at
                  )
              )[0];

          let unread = 0;

          for (
            const message
            of thread.messages || []
          ) {

            if (
              message.sender_id ===
              identity.id
            ) continue;

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
      identity,
      threads: enriched,
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
