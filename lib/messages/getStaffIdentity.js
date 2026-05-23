import { createServerSupabase }
from "@/lib/shared/supabase/server";

export async function getStaffIdentity(req) {

  const supabase =
    createServerSupabase();

  const email =
    req.headers.get(
      "x-staff-email"
    );

  if (!email) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase

    .from(
      "staff_accounts"
    )

    .select(`
      id,
      tenant_id,
      name,
      role,
      profile_picture,
      email
    `)

    .eq(
      "email",
      email
    )

    .single();

  if (
    error ||
    !data
  ) {

    return null;

  }

  return data;

}
