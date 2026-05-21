import {
  supabase,
} from "@/lib/shared/supabase/client";

export async function getCurrentSession() {

  try {

    const {
      data,
      error,
    } = await supabase.auth.getSession();

    if (error) {

      console.error(error);

      return null;

    }

    return data?.session || null;

  } catch (error) {

    console.error(error);

    return null;

  }

}
