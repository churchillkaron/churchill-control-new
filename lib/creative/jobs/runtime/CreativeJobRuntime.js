import * as Repository from "../repositories/CreativeJobRepository";

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

  async poll(providerFactory, input = {}) {
    const jobs = await Repository.list(input);

    const results = [];

    for (const job of jobs) {
      if (job.status === "COMPLETED") {
        results.push(job);
        continue;
      }

      const adapter = providerFactory(job.provider_id);

      const status = await adapter.getJobStatus(job);

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
