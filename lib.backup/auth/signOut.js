import {
  supabase,
} from "@/lib/shared/supabase/client";

export async function signOut() {

  try {

    await supabase.auth.signOut();

    window.location.href =
      "/login";

  } catch (error) {

    console.error(error);

  }

}
