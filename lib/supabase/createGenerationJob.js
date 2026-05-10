import { supabase }
from "@/lib/supabase";

export async function createGenerationJob({

  tenantId,

  campaignId = null,

  engine,

  provider,

  prompt,

  input = {},

}) {

  try {

    const {
      data,
      error,
    } = await supabase
      .from(
        "generation_jobs"
      )
      .insert({

        tenant_id:
          tenantId,

        campaign_id:
          campaignId,

        engine,

        provider,

        prompt,

        input,

        status:
          "queued",

      })
      .select()
      .single();

    if (error) {

      throw error;

    }

    return data;

  } catch (err) {

    console.error(
      "CREATE GENERATION JOB ERROR:",
      err
    );

    throw err;

  }

}