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
      target_staff_id,
    } = body;

    if (
      !target_staff_id
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "target_staff_id required",
        },
        {
          status: 400,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      data: target,
    } = await supabase

      .from(
        "staff_accounts"
      )

      .select(`
        id,
        name
      `)

      .eq(
        "id",
        target_staff_id
      )

      .single();

    if (!target) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Staff not found",
        },
        {
          status: 404,
        }
      );

    }

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
          target.name,

        type:
          "private",

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

    await supabase

      .from(
        "message_participants"
      )

      .insert([

        {

          tenant_id:
            identity.tenant_id,

          thread_id:
            thread.id,

          staff_id:
            identity.id,

        },

        {

          tenant_id:
            identity.tenant_id,

          thread_id:
            thread.id,

          staff_id:
            target.id,

        },

      ]);

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
