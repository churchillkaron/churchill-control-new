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
      data:
        membership,
    } = await supabase

      .from(
        "message_participants"
      )

      .select("id")

      .eq(
        "thread_id",
        thread_id
      )

      .eq(
        "staff_id",
        identity.id
      )

      .single();

    if (!membership) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Forbidden",
        },
        {
          status: 403,
        }
      );

    }

    const {
      data,
      error,
    } = await supabase

      .from(
        "messages"
      )

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

      .eq(
        "thread_id",
        thread_id
      )

      .order(
        "created_at",
        {
          ascending: true,
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
      messages:
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
