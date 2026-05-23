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
      reason,
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
      data,
      error,
    } = await supabase

      .from(
        "message_reports"
      )

      .insert({
        message_id,

        reported_by:
          identity.id,

        tenant_id:
          identity.tenant_id,

        reason:
          reason || "",

        status:
          "pending",
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
      report: data,
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
