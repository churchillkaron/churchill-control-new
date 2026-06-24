import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function getServerCurrentUser() {
  try {
    if (
      process.env.NEXT_PHASE ===
      "phase-production-build"
    ) {
      return null;
    }

    const cookieStore = cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data,
      error,
    } = await supabase.auth.getUser();

    if (error) {
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
