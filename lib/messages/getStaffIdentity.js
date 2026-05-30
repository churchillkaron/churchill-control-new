import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function getStaffIdentity() {

  try {

    if (
      process.env.NEXT_PHASE ===
      "phase-production-build"
    ) {
      return null;
    }

    const supabase =
      createServerSupabase();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (
      error ||
      !user
    ) {

      if (
        error?.name ===
        "AuthSessionMissingError"
      ) {
        return null;
      }

      console.error(
        "AUTH USER ERROR",
        error
      );

      return null;

    }

    const {
      data: staff,
      error: staffError,
    } = await supabase
      .from("staff_accounts")
      .select(`
        id,
        tenant_id,
        email,
        name,
        role,
        profile_picture
      `)
      .eq(
        "email",
        user.email
      )
      .single();

    if (staffError) {

      console.error(
        "STAFF LOOKUP ERROR",
        staffError
      );

      return null;

    }

    return staff || null;

  } catch (err) {

    console.error(
      "IDENTITY ERROR",
      err
    );

    return null;

  }

}
