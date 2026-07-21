import {
  createProductionTask,
  PRODUCTION_TASK_STATUS,
} from "../documents/ProductionTask";

import * as Repository from "../repositories/ProductionTaskRepository";

import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";

import {
  resolveCreativeService,
} from "@/lib/creative/services/CreativeServiceResolver";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  getRunwayTaskStatus,
} from "@/lib/platform/service-runtime/providers/runway/RunwayProvider";

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function normalizeProviderResult(execution = {}) {
  const providerResult = execution?.output || execution || {};
  const output = providerResult?.output || providerResult || {};

  return {
    provider:
      firstValue(
        execution?.provider,
        providerResult?.provider,
      ),
    model:
      firstValue(
        execution?.model,
        providerResult?.model,
      ),
    output,
    image_url:
      firstValue(
        output?.image_url,
        output?.images?.[0]?.url,
        output?.image?.url,
        providerResult?.image_url,
      ),
    video_url:
      firstValue(
        output?.video_url,
        output?.videos?.[0]?.url,
        output?.url,
        providerResult?.video_url,
      ),
    video_job_id:
      firstValue(
        output?.video_job_id,
        output?.job_id,
        output?.task_id,
        providerResult?.video_job_id,
      ),
    status:
      String(
        firstValue(
          output?.status,
          providerResult?.status,
          "",
        ),
      ).toUpperCase(),
  };
}

async function resolveAssetReference(reference) {
  if (!reference) return null;
  if (typeof reference === "object") return reference;

  try {
    return await CreativeAssetsRuntime.get(reference);
  } catch {
    return null;
  }
}

async function resolveTaskAssets(task) {
  const directReferences = [
    ...(task.input?.reference_assets || []),
    ...(task.input?.assets || []),
  ];

  const directAssets = (
    await Promise.all(
      directReferences.map(resolveAssetReference),
    )
  ).filter(Boolean);

  const dependencyAssets = [];

  for (const dependencyId of task.depends_on || []) {
    const dependency = await Repository.getById(dependencyId);
    if (!dependency) continue;

    const url = firstValue(
      dependency.output?.url,
      dependency.output?.image_url,
      dependency.output?.video_url,
      dependency.output?.asset?.url,
      dependency.output?.asset?.image_url,
      dependency.output?.asset?.file_url,
    );

    if (url) {
      dependencyAssets.push({
        id: dependency.output?.asset_id || dependency.id,
        url,
        image_url: url,
        file_url: url,
        source_task_id: dependency.id,
        source_node_id: dependency.metadata?.node_id || null,
      });
    }
  }

  return [...dependencyAssets, ...directAssets];
}

async function completeMediaTask({
  task,
  execution,
  type,
  url,
}) {
  const normalized = normalizeProviderResult(execution);

  const asset = await CreativeAssetGraphRuntime.createFromProductionTask({
    task,
    output: {
      type,
      name: task.title || `${type} Asset`,
      description: task.description || "",
      url,
      provider: normalized.provider,
      model: normalized.model,
      source_task_id: task.id,
      source_node_id: task.metadata?.node_id || null,
    },
  });

  return Repository.update(task.id, {
    status: PRODUCTION_TASK_STATUS.COMPLETED,
    output: {
      ...(task.output || {}),
      provider_submission: execution,
      asset_id: asset.id,
      asset,
      url,
      image_url: type === "IMAGE" ? url : null,
      video_url: type === "VIDEO" ? url : null,
    },
    timing: {
      ...(task.timing || {}),
      completed_at: new Date().toISOString(),
    },
    metadata: {
      ...(task.metadata || {}),
      provider: normalized.provider,
      provider_status: "COMPLETED",
    },
    error: null,
  });
}

function resolveRunwayOutput(status = {}) {
  const output = status?.output;

  if (Array.isArray(output)) {
    return output[0] || null;
  }

  return firstValue(
    output?.url,
    output?.video_url,
    status?.video_url,
    status?.url,
  );
}

export const ProductionTaskRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async get(id) {
    return Repository.getById(id);
  },

  async create(input = {}) {
    const task = createProductionTask(input);
    return Repository.create(task);
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async markReady(id) {
    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.READY,
    });
  },

  async fail(id, error) {
    const task = await Repository.getById(id);

    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.FAILED,
      error: error?.message || String(error),
      metadata: {
        ...(task?.metadata || {}),
        provider_status: "FAILED",
      },
    });
  },

  async complete(id, output = {}) {
    const task = await Repository.getById(id);

    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.COMPLETED,
      output: {
        ...(task?.output || {}),
        ...output,
      },
      timing: {
        ...(task?.timing || {}),
        completed_at: new Date().toISOString(),
      },
      error: null,
    });
  },

  async markCompleted(id, output = {}) {
    return this.complete(id, output);
  },

  async dispatch(id) {
    const task = await Repository.getById(id);

    if (!task) {
      throw new Error(`Production task not found: ${id}`);
    }

    if (
      task.status === PRODUCTION_TASK_STATUS.COMPLETED ||
      task.status === PRODUCTION_TASK_STATUS.SKIPPED
    ) {
      return task;
    }

    const attempt = Number(task.metadata?.attempt || 0) + 1;
    const maxAttempts = Number(task.metadata?.max_attempts || 3);

    if (attempt > maxAttempts) {
      return this.fail(
        id,
        new Error(`Maximum attempts exceeded for ${id}`),
      );
    }

    const assets = await resolveTaskAssets(task);
    const sourceAsset = assets[0] || null;

    await Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.RUNNING,
      timing: {
        ...(task.timing || {}),
        started_at:
          task.timing?.started_at ||
          new Date().toISOString(),
      },
      metadata: {
        ...(task.metadata || {}),
        attempt,
        provider_status: "SUBMITTING",
      },
      error: null,
    });

    try {
      const result = await runAIService.execute({
        organization_id: task.organization_id,
        service_id: resolveCreativeService(task),
        estimated_cost: task.cost?.estimated || 0,
        operation: task.type,
        input: {
          ...(task.input || {}),
          duration_seconds:
            Number(
              task.input?.duration_seconds ||
              task.timing?.estimated_seconds ||
              0,
            ),
          assets: {
            selectedAssets: assets,
          },
          source_image:
            firstValue(
              sourceAsset?.image_url,
              sourceAsset?.file_url,
              sourceAsset?.url,
            ),
          production_task_id: task.id,
        },
        metadata: {
          task,
          production_contract:
            "atomic_reference_grounded_shots_v1",
        },
      });

      const normalized = normalizeProviderResult(result);

      if (normalized.image_url) {
        return completeMediaTask({
          task,
          execution: result,
          type: "IMAGE",
          url: normalized.image_url,
        });
      }

      if (normalized.video_url && !normalized.video_job_id) {
        return completeMediaTask({
          task,
          execution: result,
          type: "VIDEO",
          url: normalized.video_url,
        });
      }

      if (normalized.video_job_id) {
        return Repository.update(id, {
          status: PRODUCTION_TASK_STATUS.RUNNING,
          output: {
            ...(task.output || {}),
            provider_submission: result,
          },
          metadata: {
            ...(task.metadata || {}),
            attempt,
            provider: normalized.provider,
            provider_job_id: normalized.video_job_id,
            provider_status:
              normalized.status || "PROCESSING",
          },
        });
      }

      return this.complete(id, {
        provider_submission: result,
        result: normalized.output,
      });
    } catch (error) {
      return this.fail(id, error);
    }
  },

  async poll(id) {
    const task = await Repository.getById(id);

    if (!task || task.status !== PRODUCTION_TASK_STATUS.RUNNING) {
      return task;
    }

    const provider = task.metadata?.provider;
    const jobId = task.metadata?.provider_job_id;

    if (!jobId) return task;

    try {
      if (provider !== "runway") {
        return task;
      }

      const status = await getRunwayTaskStatus(jobId);
      const providerStatus = String(status?.status || "").toUpperCase();

      if (["FAILED", "CANCELLED", "CANCELED"].includes(providerStatus)) {
        return this.fail(
          id,
          new Error(
            status?.failure ||
            status?.error ||
            `Provider job ${jobId} failed`,
          ),
        );
      }

      if (["SUCCEEDED", "COMPLETED", "SUCCESS"].includes(providerStatus)) {
        const url = resolveRunwayOutput(status);

        if (!url) {
          return this.fail(
            id,
            new Error(`Provider job ${jobId} completed without video output`),
          );
        }

        return completeMediaTask({
          task,
          execution: {
            provider: "runway",
            output: status,
          },
          type: "VIDEO",
          url,
        });
      }

      return Repository.update(id, {
        metadata: {
          ...(task.metadata || {}),
          provider_status:
            providerStatus || "PROCESSING",
          last_polled_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      return Repository.update(id, {
        metadata: {
          ...(task.metadata || {}),
          last_poll_error:
            error?.message || String(error),
          last_polled_at: new Date().toISOString(),
        },
      });
    }
  },
};
