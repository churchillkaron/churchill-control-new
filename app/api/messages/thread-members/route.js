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

    const {
      searchParams,
    } = new URL(req.url);

    const thread_id =
      searchParams.get(
        "thread_id"
      );

    if (!thread_id) {

      return NextResponse.json(
        {
          success: false,
          error:
            "thread_id required",
        },
        {
          status: 400,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      data,
      error,
    } = await supabase

      .from(
        "message_participants"
      )

      .select(`
        *,
        staff:staff_accounts(
          id,
          name,
          role,
          email,
          profile_picture
        )
      `)

      .eq(
        "thread_id",
        thread_id
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
      members:
        data || [],
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
