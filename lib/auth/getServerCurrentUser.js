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

    let { data, error } = await supabase.auth.getUser();

    const retryable = Boolean(
      error && (
        error.name === "AuthRetryableFetchError" ||
        error.status === 0 ||
        /fetch failed|ECONNRESET|UND_ERR_SOCKET|other side closed/i.test(String(error.message || error.cause || ""))
      )
    );

    if (retryable) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const retry = await supabase.auth.getUser();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const missingSession = Boolean(
        error.name === "AuthSessionMissingError" ||
        error.code === "session_not_found" ||
        /auth session missing/i.test(String(error.message || ""))
      );

      if (!missingSession) {
        console.error(
          "SERVER USER ERROR:",
          error
        );
      }

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
