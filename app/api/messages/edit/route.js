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
      message_id,
      content,
    } = body;

    if (
      !message_id ||
      !content
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "message_id and content required",
        },
        {
          status: 400,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      data: message,
    } = await supabase

      .from(
        "messages"
      )

      .select("*")

      .eq(
        "id",
        message_id
      )

      .single();

    if (
      !message
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Message not found",
        },
        {
          status: 404,
        }
      );

    }

    if (
      message.sender_id !==
      identity.id
    ) {

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

      .update({
        content,
      })

      .eq(
        "id",
        message_id
      )

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
