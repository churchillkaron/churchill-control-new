import { createClient } from "@supabase/supabase-js";

export default async function getSession(accessToken) {

  try {

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

    if (error || !user) {

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
      error: error.message,
    };

  }

}
