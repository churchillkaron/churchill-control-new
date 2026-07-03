import { supabase } from "@/lib/shared/supabase/client";

export async function reopenTableSession(
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
        "ACTIVE",

      closed_at:
        null,
    })
    .eq(
      "id",
      sessionId
    );

  if (error) {

    console.error(
      "REOPEN TABLE ERROR",
      error
    );

    throw error;
  }

  return true;
}
