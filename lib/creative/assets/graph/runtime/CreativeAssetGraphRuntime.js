import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
} from "../documents/CreativeAssetNode";

import * as Repository from "../repositories/CreativeAssetGraphRepository";

import {
  CreativeProviderAssetIngestionRuntime,
} from "@/lib/creative/assets/runtime/CreativeProviderAssetIngestionRuntime";

export const CreativeAssetGraphRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async create(input = {}) {
    const node = createCreativeAssetNode(input);
    return Repository.create(node);
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async createFromProductionTask({
    task,
    output = {},
  }) {
    const provider = output.provider || task.provider_id || null;
    const model = output.model || null;
    const ingestion = await CreativeProviderAssetIngestionRuntime.ingest({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
      asset_id: task.id,
      type: output.type || "IMAGE",
      url: output.url,
      provider,
      model,
    });

    return this.create({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
      production_task_id: task.id,
      type: output.type || "IMAGE",
      status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
      name: output.name || task.title || "Generated Asset",
      description: output.description || task.description || "",
      url: ingestion.public_url,
      storage_path: ingestion.storage_path || null,
      lineage: {
        source: "production_task",
        provider_id: provider,
        capability: task.capability,
        generation_version: 1,
        source_task_id: task.id,
      },
      technical: {
        mime_type: ingestion.content_type || null,
        byte_size: ingestion.byte_size || null,
        checksum: ingestion.checksum || null,
      },
      cost: {
        currency: task.cost?.currency || null,
        estimated: Number(task.cost?.estimated || 0),
        actual: Number(task.cost?.actual || 0),
        saved_by_reuse: 0,
      },
      metadata: {
        task_type: task.type,
        task_output: {
          ...output,
          url: ingestion.public_url,
          original_provider_url:
            output.url === ingestion.public_url
              ? null
              : output.url,
        },
        provider,
        model,
        canonical_storage: true,
        provider_asset_reused:
          ingestion.reused_canonical_asset === true,
      },
    });
  },

  async findReusable(input = {}) {
    return Repository.findReusable(input);
  },

  async approveForReuse(id, approvedBy = null) {
    return Repository.update(id, {
      status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
      reuse: {
        approved_for_reuse: true,
        reusable: true,
      },
      review: {
        ai_reviewed: true,
        human_reviewed: true,
        approved: true,
        approved_by: approvedBy,
      },
    });
  },
};
