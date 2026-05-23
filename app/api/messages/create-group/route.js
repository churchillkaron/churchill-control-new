import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export async function POST(req) {

  try {

    const identity =
      await getStaffIdentity(req);

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

    const body =
      await req.json();

    const {
      title,
      participant_ids = [],
    } = body;

    if (
      !title ||
      participant_ids.length === 0
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "title and participant_ids required",
        },
        {
          status: 400,
        }
      );

    }

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

        type:
          "group",

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

    const allParticipants = [

      identity.id,

      ...participant_ids,

    ];

    await supabase

      .from(
        "message_participants"
      )

      .insert(

        allParticipants.map(
          (staffId) => ({

            tenant_id:
              identity.tenant_id,

            thread_id:
              thread.id,

            staff_id:
              staffId,

          })
        )

      );

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
