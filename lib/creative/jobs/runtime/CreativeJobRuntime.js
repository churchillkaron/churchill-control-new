import * as Repository from "../repositories/CreativeJobRepository";

import {
  ServiceCapabilityResolver
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";


export const CreativeJobRuntime = {

  async create(job) {

    return Repository.create(job);

  },


  async list(input = {}) {

    return Repository.list(input);

  },


  async update(providerJobId, data) {

    return Repository.updateByProviderJobId(
      providerJobId,
      data,
    );

  },


  async poll(input = {}) {

    const jobs =
      await Repository.list(input);


    const results = [];


    for (const job of jobs) {


      if (job.status === "COMPLETED") {

        results.push(job);

        continue;

      }


      const capability =
        job.capability ||
        "creative.generation";


      const service =
        await ServiceCapabilityResolver.resolve({
          organization_id:
            job.organization_id,

          capability,

        });


      if (!service) {

        results.push({
          ...job,
          status:"FAILED",
          error:
            "No service capability available",
        });

        continue;

      }


      const status =
        await service.getJobStatus({
          provider_job_id:
            job.provider_job_id,

          metadata:
            job.metadata || {},

        });


      const updated =
        await Repository.updateByProviderJobId(
          job.provider_job_id,
          status,
        );


      results.push(updated);

    }


    return results;

  },

};
