import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext
from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const PROFILE_BUCKET = "staff-profile-pictures";
const MAX_PROFILE_BYTES = 5 * 1024 * 1024;
const PROFILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const runtime =
  "nodejs";

export async function POST(req) {

  try {

    const context = await resolveAuthenticatedStaffContext({ request: req });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 }
      );
    }

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

    if (String(staff_id) !== String(context.staff.id)) {
      return NextResponse.json(
        { success: false, error: "You can only update your own Staff profile picture." },
        { status: 403 }
      );
    }

    const contentType = String(file.type || "").trim().toLowerCase();
    if (!PROFILE_TYPES.has(contentType)) {
      return NextResponse.json(
        { success: false, error: "Profile picture must be JPEG, PNG or WebP." },
        { status: 415 }
      );
    }
    if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) {
      return NextResponse.json(
        { success: false, error: "Profile picture is empty." },
        { status: 400 }
      );
    }
    if (Number(file.size) > MAX_PROFILE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Profile picture exceeds 5 MB." },
        { status: 413 }
      );
    }

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    const filePath =
      `${context.organizationId}/${staff_id}/profile`;

    const {
      error: uploadError,
    } = await supabaseAdmin.storage

      .from(
        PROFILE_BUCKET
      )

      .upload(
        filePath,
        buffer,
        {
          contentType:
            contentType,
          cacheControl: "300",
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

    const profileUrl =
      `/api/staff/profile-picture/${encodeURIComponent(String(staff_id))}`;

    const {
      error: updateError,
    } = await supabaseAdmin

      .from(
        "staff_accounts"
      )

      .update({
        profile_picture:
          profileUrl,
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
        profileUrl,

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
