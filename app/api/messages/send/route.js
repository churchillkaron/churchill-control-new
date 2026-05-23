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
      content,
      attachment_url = null,
    } = body;

    if (
      !thread_id ||
      (
        !content &&
        !attachment_url
      )
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Message content or attachment required",
        },
        {
          status: 400,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      data: participant,
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

    if (!participant) {

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

      .insert({

        tenant_id:
          identity.tenant_id,

        thread_id,

        sender_id:
          identity.id,

        content:
          content || "",

        attachment_url,

      })

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

      .single();

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

    await supabase

      .from(
        "message_threads"
      )

      .update({
        updated_at:
          new Date().toISOString(),
      })

      .eq(
        "id",
        thread_id
      );

    return NextResponse.json({
      success: true,
      message: data,
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
