import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function getServerCurrentUser() {

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
      data,
      error,
    } = await supabase.auth.getUser();

    if (error) {

      if (
        error.name ===
        "AuthSessionMissingError"
      ) {

        return null;

      }

      console.error(
        "SERVER USER ERROR:",
        error
      );

      return null;

    }

    return data?.user || null;

  } catch (error) {

    console.error(
      "SERVER USER EXCEPTION:",
      error
    );

    return null;

  }

}
