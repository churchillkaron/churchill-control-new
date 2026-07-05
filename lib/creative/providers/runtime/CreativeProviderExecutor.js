import {
  CreativeJobRuntime,
} from "@/lib/creative/jobs/runtime/CreativeJobRuntime";

import {
  getCreativeProvider,
} from "@/lib/creative/providers/ProviderFactory";

import {
  ProductionTaskRuntime,
} from "@/lib/creative/production/tasks/runtime/ProductionTaskRuntime";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

import {
  CreativeAssetIntelligenceRuntime,
} from "@/lib/creative/assets/intelligence/runtime/CreativeAssetIntelligenceRuntime";

import {
  CreativeAssetVersionRuntime,
} from "@/lib/creative/assets/versioning/runtime/CreativeAssetVersionRuntime";

import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

export const CreativeProviderExecutor = {

  async process(job) {

    await CreativeStateEngine.set(

      job.creative_project_id,

      PIPELINE_STAGES.PRODUCTION,

    );

    const adapter =
      getCreativeProvider(
        job.provider_id,
      );

    if (job.asset_created_at) {
      return null;
    }

    const asset =
      await adapter.downloadResult(
        job,
      );

    const stored =
      await CreativeStorageRuntime.uploadFromUrl({

        organization_id:
          job.organization_id,

        creative_project_id:
          job.creative_project_id,

        asset_id:
          job.provider_job_id,

        url:
          asset.uri,

        filename:
          "result",

      });

    await ProductionTaskRuntime.complete(
      job.production_task_id,
    );

    const intelligence =
      await CreativeAssetIntelligenceRuntime.analyze({

        ...asset,

        uri:
          stored.public_url,

        storage_path:
          stored.storage_path,

      });

    const created =
      await CreativeAssetGraphRuntime.create({

      organization_id:
        job.organization_id,

      creative_project_id:
        job.creative_project_id,

      production_task_id:
        job.production_task_id,

      type:
        asset.type || "IMAGE",

      title:
        asset.title || "Generated Asset",

      uri:
        stored.public_url,

      storage_path:
        stored.storage_path,

      metadata: {

        provider:
          job.provider_id,

        provider_job_id:
          job.provider_job_id,

        ...asset.metadata,

      },

      intelligence,


    });

    await CreativeAssetVersionRuntime.createVersion({

      parent_asset_id:
        created.id,

      asset:
        created,

    });

    await CreativeJobRuntime.update(
      job.provider_job_id,
      {
        asset_created_at:
          new Date().toISOString(),
      },
    );

    await CreativeStateEngine.set(

      job.creative_project_id,

      PIPELINE_STAGES.COMPLETE,

    );

    return created;

  },

  async processAll(input = {}) {

    const jobs =
      await CreativeJobRuntime.list(
        input,
      );

    const completed = [];

    for (const job of jobs) {

      if (job.status !== "COMPLETED") {
        continue;
      }

      completed.push(
        await this.process(job),
      );

    }

    return completed;

  },

};
