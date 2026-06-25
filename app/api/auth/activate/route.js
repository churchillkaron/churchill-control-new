export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function randomPassword() {
  return Math.random().toString(36).slice(-12);
}

export async function POST(req) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email required" },
        { status: 400 }
      );
    }

    const { data: staff } = await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .eq("email", email)
      .single();

    if (!staff) {
      return NextResponse.json(
        {
          success: false,
          error: "Email not registered. Contact manager."
        },
        { status: 404 }
      );
    }

    let authUserId = staff.auth_user_id;

    if (!authUserId) {

      const { data, error } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: randomPassword(),
          email_confirm: true,
        });

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }

      authUserId = data.user.id;

      await supabaseAdmin
        .from("staff_accounts")
        .update({
          auth_user_id: authUserId
        })
        .eq("id", staff.id);
    }

    const { error: resetError } =
      await supabaseAdmin.auth.resetPasswordForEmail(
        email,
        {
          redirectTo:
            process.env.NEXT_PUBLIC_APP_URL +
            "/login"
        }
      );

    if (resetError) {
      return NextResponse.json(
        { success: false, error: resetError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Password setup email sent."
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}
