import {
  supabase,
} from "@/lib/shared/supabase/client";

export async function getCurrentUser() {

  try {

    const {
      data,
      error,
    } = await supabase.auth.getUser();

    if (error) {

      console.error(error);

      return null;

    }

    return data?.user || null;

  } catch (error) {

    console.error(error);

    return null;

  }

}
