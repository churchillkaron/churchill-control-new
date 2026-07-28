export const dynamic = "force-dynamic";

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function randomPassword() {
  return randomBytes(24).toString("base64url");
}

function resolveRedirectOrigin(request) {
  const configuredOrigin = String(
    process.env.NEXT_PUBLIC_APP_URL || ""
  ).trim();

  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Fall back to the request origin below.
    }
  }

  return new URL(request.url).origin;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email required" },
        { status: 400 }
      );
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id, email, auth_user_id, active")
      .ilike("email", email)
      .maybeSingle();

    if (staffError) {
      return NextResponse.json(
        { success: false, error: staffError.message },
        { status: 500 }
      );
    }

    if (!staff) {
      return NextResponse.json(
        {
          success: false,
          error: "Email not registered. Contact manager.",
        },
        { status: 404 }
      );
    }

    if (staff.active === false) {
      return NextResponse.json(
        {
          success: false,
          error: "This staff account is inactive. Contact manager.",
        },
        { status: 403 }
      );
    }

    let authUserId = staff.auth_user_id;

    if (!authUserId) {
      const { data, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: randomPassword(),
          email_confirm: true,
        });

      if (createError) {
        return NextResponse.json(
          { success: false, error: createError.message },
          { status: 400 }
        );
      }

      authUserId = data.user.id;

      const { error: linkError } = await supabaseAdmin
        .from("staff_accounts")
        .update({ auth_user_id: authUserId })
        .eq("id", staff.id);

      if (linkError) {
        return NextResponse.json(
          { success: false, error: linkError.message },
          { status: 500 }
        );
      }
    }

    const redirectTo = new URL(
      "/login",
      resolveRedirectOrigin(request)
    ).toString();

    const { error: resetError } =
      await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

    if (resetError) {
      return NextResponse.json(
        { success: false, error: resetError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password setup email sent.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to send the password email.",
      },
      { status: 500 }
    );
  }
}
