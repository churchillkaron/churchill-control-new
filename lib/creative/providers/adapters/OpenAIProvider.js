import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIProvider {

  id = "openai";

  async submitJob(task) {

    switch (task.type) {

      case "GENERATE_IMAGE": {

        const result =
          await client.images.generate({

            model: "gpt-image-1",

            prompt:
              task.prompt,

            size:
              task.size || "1536x1536",

          });

        return {

          provider_job_id:
            crypto.randomUUID(),

          status:
            "COMPLETED",

          output:
            result,

        };

      }

      default:

        throw new Error(
          `Unsupported task type: ${task.type}`
        );

    }

  }

  async getJobStatus(job) {

    return {

      status:
        job.status || "COMPLETED",

    };

  }

  async downloadResult(job) {

    const image =
      job.metadata?.output?.data?.[0];

    return {

      type: "IMAGE",

      title:
        job.production_task_id,

      uri:
        image?.url || null,

      metadata:
        job.metadata,

    };

  }

}
