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
      content,
    } = body;

    if (
      !content
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Content required",
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

        title:
          title ||
          "Enterprise Broadcast",

        type:
          "broadcast",

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

    const {
      data: staff,
    } = await supabase

      .from(
        "staff_accounts"
      )

      .select(`
        id
      `)

      .eq(
        "tenant_id",
        identity.tenant_id
      );

    if (
      staff?.length
    ) {

      await supabase

        .from(
          "message_participants"
        )

        .insert(

          staff.map(
            (member) => ({

              tenant_id:
                identity.tenant_id,

              thread_id:
                thread.id,

              staff_id:
                member.id,

            })
          )

        );

    }

    const {
      data: message,
      error: messageError,
    } = await supabase

      .from(
        "messages"
      )

      .insert({

        tenant_id:
          identity.tenant_id,

        thread_id:
          thread.id,

        sender_id:
          identity.id,

        content,

      })

      .select(`
        *,
        sender:staff_accounts(
          id,
          name,
          role,
          profile_picture
        )
      `)

      .single();

    if (
      messageError
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            messageError.message,
        },
        {
          status: 500,
        }
      );

    }

    return NextResponse.json({
      success: true,
      thread,
      message,
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
