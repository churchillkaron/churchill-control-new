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
      message_id,
    } = body;

    if (!message_id) {

      return NextResponse.json(
        {
          success: false,
          error:
            "message_id required",
        },
        {
          status: 400,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      data: exists,
    } = await supabase

      .from(
        "message_reads"
      )

      .select("id")

      .eq(
        "message_id",
        message_id
      )

      .eq(
        "staff_id",
        identity.id
      )

      .single();

    if (exists) {

      return NextResponse.json({
        success: true,
        already_read: true,
      });

    }

    const {
      data,
      error,
    } = await supabase

      .from(
        "message_reads"
      )

      .insert({
        tenant_id:
          identity.tenant_id,

        message_id,

        staff_id:
          identity.id,
      })

      .select("*")
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

    return NextResponse.json({
      success: true,
      read: data,
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
