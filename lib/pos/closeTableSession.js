import { supabase } from "@/lib/shared/supabase/client";

export async function closeTableSession(
  sessionId
) {

  if (!sessionId) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("table_sessions")
    .update({

      status:
        "CLOSED",

      closed_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      sessionId
    );

  if (error) {

    console.error(
      "CLOSE SESSION ERROR",
      error
    );

    throw error;
  }

  return true;
}
