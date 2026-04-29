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
      console.log("INVITE ERROR FULL:", inviteError); // ✅ IMPORTANT
      return Response.json(
        { error: inviteError.message },
        { status: 400 }
      );
    }

    // 2. Insert into staff_accounts
    const { error: insertError } = await supabase
      .from("staff_accounts")
      .insert([
        {
          auth_user_id: inviteData.user.id,
          name,
          email,
          role,
          position,
          tenant_id,
          active: true,
        },
      ]);

    if (insertError) {
      console.log("DB INSERT ERROR:", insertError); // ✅ ALSO LOG THIS
      return Response.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.log("SERVER ERROR:", err); // ✅ FULL BACKEND FAIL SAFE
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}