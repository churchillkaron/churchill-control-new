import { supabase }
from "@/lib/shared/supabase/client";

export async function createGenerationJob({

  tenantId,

  page_id: pageId,

  campaignId = null,

  engine,

  selectedBusiness,

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

        page_id: pageId,

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