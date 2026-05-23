import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

export const runtime = "nodejs";

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

    const formData =
      await req.formData();

    const audio =
      formData.get("audio");

    const thread_id =
      formData.get("thread_id");

    if (
      !audio ||
      !thread_id
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "audio and thread_id required",
        },
        {
          status: 400,
        }
      );

    }

    const supabase =
      createServerSupabase();

    const buffer =
      Buffer.from(
        await audio.arrayBuffer()
      );

    const path =
      `voice-notes/${identity.tenant_id}/${Date.now()}.webm`;

    const {
      error: uploadError,
    } = await supabase.storage

      .from(
        "uploads"
      )

      .upload(
        path,
        buffer,
        {
          contentType:
            "audio/webm",
          upsert: true,
        }
      );

    if (
      uploadError
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            uploadError.message,
        },
        {
          status: 500,
        }
      );

    }

    const {
      data: publicUrl,
    } = supabase.storage

      .from(
        "uploads"
      )

      .getPublicUrl(
        path
      );

    const {
      data: message,
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
          "Voice Note",

        attachment_url:
          publicUrl.publicUrl,
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
