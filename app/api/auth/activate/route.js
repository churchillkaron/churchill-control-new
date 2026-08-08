export const dynamic = "force-dynamic";

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function randomPassword() {
  return randomBytes(32).toString("base64url");
}

function resolveRedirectOrigin(request) {
  const configuredOrigin = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();

  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Fall back to the request origin.
    }
  }

  return new URL(request.url).origin;
}

async function findAuthUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = data?.users || [];
    const match = users.find(
      (user) => normalizeEmail(user?.email) === normalizedEmail
    );

    if (match) return match;
    if (users.length < perPage) return null;
  }

  throw new Error("Unable to resolve authentication user safely");
}

async function rollbackNewLinks(staffIds, authUserId) {
  if (!staffIds.length || !authUserId) return;

  await supabaseAdmin
    .from("staff_accounts")
    .update({ auth_user_id: null })
    .in("id", staffIds)
    .eq("auth_user_id", authUserId);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body?.email);

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email required" },
        { status: 400 }
      );
    }

    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,email,auth_user_id,active,active_organization_id")
      .ilike("email", email)
      .eq("active", true)
      .limit(100);

    if (staffError) throw staffError;

    const staff = staffRows || [];

    if (!staff.length) {
      return NextResponse.json({
        success: true,
        message: "If this email has active staff access, a password link will be sent.",
      });
    }

    const linkedAuthIds = [
      ...new Set(staff.map((row) => row.auth_user_id).filter(Boolean)),
    ];

    if (linkedAuthIds.length > 1) {
      return NextResponse.json(
        {
          success: false,
          error: "This email has conflicting staff identities. Contact an administrator.",
        },
        { status: 409 }
      );
    }

    let authUserId = linkedAuthIds[0] || null;
    let createdAuthUser = false;

    if (!authUserId) {
      const existingAuthUser = await findAuthUserByEmail(email);

      if (existingAuthUser?.id) {
        authUserId = existingAuthUser.id;
      } else {
        const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: randomPassword(),
          email_confirm: true,
        });

        if (createError) throw createError;

        authUserId = data?.user?.id || null;
        createdAuthUser = true;
      }
    }

    if (!authUserId) {
      throw new Error("Authentication user was not resolved");
    }

    const unlinkedStaffIds = staff
      .filter((row) => !row.auth_user_id)
      .map((row) => row.id);

    if (unlinkedStaffIds.length) {
      const { error: linkError } = await supabaseAdmin
        .from("staff_accounts")
        .update({ auth_user_id: authUserId })
        .in("id", unlinkedStaffIds)
        .is("auth_user_id", null);

      if (linkError) {
        if (createdAuthUser) {
          await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => null);
        }
        throw linkError;
      }
    }

    const redirectTo = new URL(
      "/login#type=recovery",
      resolveRedirectOrigin(request)
    ).toString();

    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
      email,
      { redirectTo }
    );

    if (resetError) {
      await rollbackNewLinks(unlinkedStaffIds, authUserId);

      if (createdAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => null);
      }

      throw resetError;
    }

    return NextResponse.json({
      success: true,
      message: "Check your email for a secure link to create or reset your password.",
    });
  } catch (error) {
    console.error("STAFF_AUTH_ACTIVATION_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to send the password email.",
      },
      { status: 500 }
    );
  }
}
