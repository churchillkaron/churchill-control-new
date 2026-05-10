import { supabase }
from "@/lib/supabase";

export async function updateGenerationJob({

  jobId,

  updates,

}) {

  try {

    const {
      data,
      error,
    } = await supabase
      .from(
        "generation_jobs"
      )
      .update(updates)
      .eq(
        "id",
        jobId
      )
      .select()
      .single();

    if (error) {

      throw error;

    }

    return data;

  } catch (err) {

    console.error(
      "UPDATE GENERATION JOB ERROR:",
      err
    );

    throw err;

  }

}