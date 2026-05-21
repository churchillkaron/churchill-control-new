import { cookies } from "next/headers";


export default async function getServerUser() {

  try {

    const cookieStore =
      cookies();

    const accessToken =
      cookieStore.get(
        "sb-access-token"
      )?.value;

    if (!accessToken) {

      return {
        authenticated: false,
      };
    }

    const supabase =
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          },
        }
      );

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (
      error ||
      !user
    ) {

      return {
        authenticated: false,
      };
    }

    return {
      authenticated: true,
      user,
    };

  } catch (error) {

    return {
      authenticated: false,
      error:
        error.message,
    };
  }
}
