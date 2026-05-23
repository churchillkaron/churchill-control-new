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
      thread_id,
      participant_ids = [],
    } = body;

    if (
      !thread_id ||
      participant_ids.length === 0
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "thread_id and participant_ids required",
        },
        {
          status: 400,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const inserts =
      participant_ids.map(
        (staffId) => ({

          tenant_id:
            identity.tenant_id,

          thread_id,

          staff_id:
            staffId,

        })
      );

    const {
      error,
    } = await supabase

      .from(
        "message_participants"
      )

      .upsert(
        inserts,
        {
          onConflict:
            "thread_id,staff_id",
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

    return NextResponse.json({
      success: true,
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
