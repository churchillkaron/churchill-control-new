import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function isMissingSession(error) {
  const name = String(error?.name || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    name.includes("authsessionmissing") ||
    code === "session_not_found" ||
    message.includes("auth session missing")
  );
}

export async function getServerCurrentUser() {
  try {
    if (process.env.NEXT_PHASE === "phase-production-build") {
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
      },
    );

    const { data, error } = await supabase.auth.getUser();

    if (error) {
      if (isMissingSession(error)) return null;

      console.error("SERVER_USER_ERROR", {
        name: error?.name || null,
        code: error?.code || null,
        message: error?.message || "Unable to resolve server user",
      });
      return null;
    }

    return data?.user || null;
  } catch (error) {
    if (isMissingSession(error)) return null;

    console.error("SERVER_USER_EXCEPTION", {
      name: error?.name || null,
      code: error?.code || null,
      message: error?.message || "Unable to resolve server user",
    });
    return null;
  }
}
