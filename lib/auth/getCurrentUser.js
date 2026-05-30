"use client";

import {
  supabase,
} from "@/lib/shared/supabase/client";

export async function getCurrentUser() {

  try {

    if (
      typeof window === "undefined"
    ) {

      return null;

    }

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
        "AUTH USER ERROR",
        error
      );

      return null;

    }

    return data?.user || null;

  } catch (error) {

    console.error(
      "AUTH USER EXCEPTION",
      error
    );

    return null;

  }

}
