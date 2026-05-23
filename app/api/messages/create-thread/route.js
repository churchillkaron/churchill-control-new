import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export async function POST(req) {

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

    const body =
      await req.json();

    const {
      title,
      participants = [],
      type = "private",
    } = body;

    const supabase =
      createServerSupabase();

    const {
      data: thread,
      error: threadError,
    } = await supabase

      .from(
        "message_threads"
      )

      .insert({
        tenant_id:
          identity.tenant_id,

        created_by:
          identity.id,

        title,

        type,
      })

      .select("*")
      .single();

    if (
      threadError
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            threadError.message,
        },
        {
          status: 500,
        }
      );

    }

    const uniqueParticipants =
      [
        ...new Set([
          ...participants,
          identity.id,
        ]),
      ];

    const rows =
      uniqueParticipants.map(
        (staff_id) => ({
          tenant_id:
            identity.tenant_id,

          thread_id:
            thread.id,

          staff_id,
        })
      );

    const {
      error:
        participantError,
    } = await supabase

      .from(
        "message_participants"
      )

      .insert(rows);

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

    return NextResponse.json({
      success: true,
      thread,
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
