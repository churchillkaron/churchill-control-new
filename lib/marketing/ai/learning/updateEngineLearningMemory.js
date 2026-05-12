import { supabase }
from "@/lib/supabase";

export async function updateEngineLearningMemory({

  tenantId,

  pageId,

  campaign,

  generationJob,

}) {

  try {

    if (
      !campaign ||
      !generationJob
    ) {

      return null;

    }

    const duration =

      generationJob.started_at &&
      generationJob.completed_at

        ? (

            new Date(
              generationJob.completed_at
            ) -

            new Date(
              generationJob.started_at
            )

          ) / 1000

        : 0;

    const payload = {

      tenant_id:
        tenantId,

      page_id:
        pageId,

      campaign_id:
        campaign.id,

      campaign_type:
        campaign.campaign_type,

      engine:
        generationJob.engine,

      provider:
        generationJob.provider,

      performance_score:
        campaign.performance_score || 0,

      success:

        generationJob.status ===
        "completed",

      avg_duration:
        duration,

      retry_count:
        generationJob.retry_count || 0,

      engagement:
        campaign.analytics || {},

      created_at:
        new Date()
          .toISOString(),

    };

    console.log(
      "ENGINE LEARNING MEMORY:",
      payload
    );

    const {
      data,
      error,
    } = await supabase

      .from(
        "engine_learning_memory"
      )

      .insert(payload)

      .select()

      .single();

    if (error) {

      console.error(
        "ENGINE LEARNING INSERT ERROR:",
        error
      );

      return null;

    }

    return data;

  } catch (err) {

    console.error(
      "UPDATE ENGINE LEARNING ERROR:",
      err
    );

    return null;

  }

}