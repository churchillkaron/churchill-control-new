import { supabase }
from "@/lib/supabase";

export async function updateGenerationJob({

  id,

  updates,

}) {

  const {
    data,
    error,
  } = await supabase
    .from(
      "generation_jobs"
    )
    .update(updates)
    .eq("id", id)
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

}