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
      emoji,
    } = body;

    if (
      !message_id ||
      !emoji
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "message_id and emoji required",
        },
        {
          status: 400,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const {
      data: existing,
    } = await supabase

      .from(
        "message_reactions"
      )

      .select("*")

      .eq(
        "message_id",
        message_id
      )

      .eq(
        "staff_id",
        identity.id
      )

      .eq(
        "emoji",
        emoji
      )

      .maybeSingle();

    if (existing) {

      await supabase

        .from(
          "message_reactions"
        )

        .delete()

        .eq(
          "id",
          existing.id
        );

      return NextResponse.json({
        success: true,
        removed: true,
      });

    }

    const {
      data,
      error,
    } = await supabase

      .from(
        "message_reactions"
      )

      .insert({
        message_id,
        staff_id:
          identity.id,
        emoji,
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
      reaction: data,
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
