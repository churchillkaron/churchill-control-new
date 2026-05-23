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
      thread_id,
    } = body;

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
      data: thread,
    } = await supabase

      .from(
        "message_threads"
      )

      .select(`
        id,
        created_by
      `)

      .eq(
        "id",
        thread_id
      )

      .single();

    if (!thread) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Thread not found",
        },
        {
          status: 404,
        }
      );

    }

    if (
      thread.created_by !==
      identity.id
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Only creator can delete thread",
        },
        {
          status: 403,
        }
      );

    }

    const {
      error,
    } = await supabase

      .from(
        "message_threads"
      )

      .delete()

      .eq(
        "id",
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
