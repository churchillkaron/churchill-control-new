import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // IMPORTANT (server only)
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

    // 2. Save to your staff table
    const { error: insertError } = await supabase
      .from("staff_accounts")
      .insert([
        {
          user_id: inviteData.user.id,
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