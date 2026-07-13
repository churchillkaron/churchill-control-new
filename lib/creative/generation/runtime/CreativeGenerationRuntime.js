import {
  create,
  update,
} from "../repositories/CreativeGenerationRepository";

import {
  create as createServiceExecution,
} from "@/lib/creative/services/repositories/CreativeServiceExecutionRepository";


export const CreativeGenerationRuntime = {


  async create({
    organization_id,
    entity_id = null,
    campaign_id = null,
    mission_id = null,
    asset_id = null,

    capability,

    input = {},

    metadata = {},

  }) {


    const job =
      await create({

        organization_id,

        entity_id,

        campaign_id,

        mission_id,

        asset_id,

        generation_type:
          capability,

        capability,

        input,

        metadata,

        status:
          "PENDING",

      });



    await createServiceExecution({

      organization_id,

      entity_id,

      generation_job_id:
        job.id,

      service_code:
        capability,

      capability,

      input,

      metadata,

      status:
        "PENDING",

    });



    return job;

  },


  async complete(
    id,
    output={}
  ){

    return update(
      id,
      {
        output,
        status:
          "COMPLETED",
      }
    );

  },


  async fail(
    id,
    error
  ){

    return update(
      id,
      {
        status:
          "FAILED",

        output:{
          error:
            error?.message ||
            String(error),
        },

      }
    );

  },


};
