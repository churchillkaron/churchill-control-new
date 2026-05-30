"use client";

import {
  supabase,
} from "@/lib/shared/supabase/client";

export async function getCurrentSession() {

  try {

    if (
      typeof window === "undefined"
    ) {
      return null;
    }

    const {
      data,
      error,
    } = await supabase.auth.getSession();

    if (error) {

      if (
        error.name ===
        "AuthSessionMissingError"
      ) {
        return null;
      }

      console.error(
        "AUTH SESSION ERROR",
        error
      );

      return null;

    }

    return data?.session || null;

  } catch (error) {

    console.error(
      "AUTH SESSION EXCEPTION",
      error
    );

    return null;

  }

}
