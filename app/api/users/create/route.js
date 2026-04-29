import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();
    const { name, email, role, position, tenant_id } = body;

    // 1. Invite user (sends email)
    const { data: inviteData, error: inviteError } =
      await supabase.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      return Response.json({ error: inviteError.message }, { status: 400 });
    }

    // 2. Insert into staff_accounts (correct column)
    const { error: insertError } = await supabase
      .from("staff_accounts")
      .insert([
        {
          auth_user_id: inviteData.user.id, // ✅ correct mapping
          name,
          email,
          role,
          position,
          tenant_id,
          active: true,
        },
      ]);

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 400 });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}