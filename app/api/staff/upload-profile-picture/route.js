import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

export const runtime =
  "nodejs";

export async function POST(req) {

  try {

    const supabase =
      createServerSupabase();

    const formData =
      await req.formData();

    const file =
      formData.get("file");

    const staff_id =
      formData.get("staff_id");

    if (
      !file ||
      !staff_id
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Missing file or staff_id",
        },
        {
          status: 400,
        }
      );

    }

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    const fileName =
      `${staff_id}-${Date.now()}.png`;

    const filePath =
      `staff/${fileName}`;

    const {
      error: uploadError,
    } = await supabase.storage

      .from(
        "uploads"
      )

      .upload(
        filePath,
        buffer,
        {
          contentType:
            file.type,
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

    const { data } =
      supabase.storage

        .from(
          "uploads"
        )

        .getPublicUrl(
          filePath
        );

    const publicUrl =
      data.publicUrl;

    const {
      error: updateError,
    } = await supabase

      .from(
        "staff_accounts"
      )

      .update({
        profile_picture:
          publicUrl,
      })

      .eq(
        "id",
        staff_id
      );

    if (
      updateError
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            updateError.message,
        },
        {
          status: 500,
        }
      );

    }

    return NextResponse.json({

      success: true,

      url:
        publicUrl,

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
