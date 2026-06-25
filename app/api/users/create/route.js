export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function generatePassword() {
  return Math.random().toString(36).slice(-8);
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      name,
      email,
      role,
      position,
      tenant_id,
    } = body;

    if (!name || !email || !role || !tenant_id) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const password = generatePassword();

    const {
      data,
      error: createError,
    } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }).eq("email", email);

    if (createError) {
      return Response.json(
        { error: createError.message },
        { status: 400 }
      );
    }

    const authUserId = data.user.id;

    const {
      data: tenantUser,
      error: tenantError,
    } = await supabaseAdmin
      .from("tenant_users")
      .insert({
        auth_user_id: authUserId,
        tenant_id,
        email,
        full_name: name,
        role,
        status: "active",
      })
      .select()
      .single();

    if (tenantError) {
      return Response.json(
        { error: tenantError.message },
        { status: 400 }
      );
    }

    const {
      error: staffError,
    } = await supabaseAdmin
      .from("staff_accounts")
      .update({
        auth_user_id: authUserId,
      });

    if (staffError) {
      return Response.json(
        { error: staffError.message },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      email,
      password,
      tenant_user_id: tenantUser.id,
    });

  } catch (err) {

    return Response.json(
      { error: "Server error" },
      { status: 500 }
    );

  }
}
