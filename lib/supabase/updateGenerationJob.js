import { supabase }
from "@/lib/supabase";

export async function updateGenerationJob({

  id,

  updates,

}) {

  try {

    const safeUpdates = {

      ...updates,

      updated_at:
        new Date()
          .toISOString(),

    };

    // FAILURE TRACKING

    if (
      safeUpdates.status ===
      "failed"
    ) {

      safeUpdates.failed_at =
        new Date()
          .toISOString();

    }

    // COMPLETION TRACKING

    if (
      safeUpdates.status ===
      "completed"
    ) {

      safeUpdates.completed_at =
        new Date()
          .toISOString();

    }

    const {

      data,

      error,

    } = await supabase

      .from(
        "generation_jobs"
      )

      .update(
        safeUpdates
      )

      .eq(
        "id",
        id
      )

      .select()

      .single();

    if (error) {

      console.error(

        "UPDATE GENERATION JOB ERROR:",

        error

      );

      throw error;

    }

    return data;

  } catch (err) {

    console.error(

      "UPDATE GENERATION JOB FATAL ERROR:",

      err

    );

    throw err;

  }

}