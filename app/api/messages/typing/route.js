import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export async function POST(req) {

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

    const body =
      await req.json();

    const {
      thread_id,
      typing,
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

    await supabase

      .from(
        "message_typing"
      )

      .upsert(
        {
          thread_id,
          staff_id:
            identity.id,
          typing,
          updated_at:
            new Date()
              .toISOString(),
        },
        {
          onConflict:
            "thread_id,staff_id",
        }
      );

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

export async function GET(req) {

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

    const {
      searchParams,
    } = new URL(req.url);

    const thread_id =
      searchParams.get(
        "thread_id"
      );

    const supabase =
      createServerSupabase();

    const {
      data,
    } = await supabase

      .from(
        "message_typing"
      )

      .select(`
        *,
        staff:staff_accounts(
          id,
          name
        )
      `)

      .eq(
        "thread_id",
        thread_id
      )

      .eq(
        "typing",
        true
      )

      .neq(
        "staff_id",
        identity.id
      );

    return NextResponse.json({
      success: true,
      typing:
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
