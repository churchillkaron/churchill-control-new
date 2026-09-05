import { randomUUID } from "node:crypto";

import {
  createProductionTask,
  PRODUCTION_TASK_STATUS,
} from "../documents/ProductionTask";

import * as Repository
from "../repositories/ProductionTaskRepository";

import {
  ProductionTaskSettlementRuntime,
} from "./ProductionTaskSettlementRuntime";

import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

import {
  resolveCreativeService,
} from "@/lib/creative/services/CreativeServiceResolver";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

import {
  resolveCreativeProviderMediaReference,
} from "@/lib/creative/providers/runtime/CreativeProviderMediaOutputRuntime";

function providerOutput(result = {}) {
  return result?.output || result || {};
}

function outputUrl(result = {}) {
  return resolveCreativeProviderMediaReference(result);
}

function text(value) {
  return String(value ?? "").trim();
}

function taskWorker(operation, id) {
  return `creative-production:${operation}:${id}:${randomUUID()}`;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function preferredProvider(task = {}) {
  return text(
    task.provider_id ||
    task.input?.generation?.provider ||
    task.input?.provider ||
    task.metadata?.provider,
  ) || null;
}

function executionInput(task = {}) {
  const input = task.input || {};
  const capability = text(task.capability || task.service_code).toLowerCase();
  if (positiveNumber(input.quantity)) return input;

  const durationPricedCapabilities = new Set([
    "ai.video.generate",
    "ai.video.image_to_video",
    "ai.video.first_last_frame_to_video",
    "ai.video.video_to_video",
    "ai.video.edit",
    "ai.video.inpaint",
    "ai.music.generate",
    "ai.sfx.generate",
  ]);
  if (!durationPricedCapabilities.has(capability)) return input;

  const duration = positiveNumber(
    input.duration_seconds ||
    input.duration ||
    input.output_spec?.duration_seconds ||
    input.generation?.estimated_seconds ||
    input.generation?.duration_seconds ||
    input.generation?.output_spec?.duration_seconds ||
    input.requirements?.duration_seconds ||
    task.timing?.estimated_seconds,
  );

  return duration
    ? {
        ...input,
        quantity: duration,
        media_duration_seconds: duration,
      }
    : input;
}

function pendingSettlement(task = {}) {
  const submission = task.output?.provider_submission || {};
  const usage = submission.usage || task.output?.usage || {};
  const pricing = submission.pricing || task.output?.pricing || {};
  const providerJobId =
    task.output?.provider_job_id ||
    submission.provider_job_id ||
    submission.output?.provider_job_id ||
    submission.output?.output?.provider_job_id ||
    null;

  return {
    submission,
    usage,
    pricing,
    provider_job_id: providerJobId,
    provider:
      task.provider_id ||
      submission.provider ||
      task.output?.provider ||
      null,
    credential_id:
      submission.credential_id ||
      task.output?.credential_id ||
      null,
    started_at:
      submission.started_at ||
      task.timing?.started_at ||
      null,
  };
}

async function existingAssetNodeForTask(task = {}) {
  if (!task.organization_id || !task.creative_project_id || !task.id) {
    return null;
  }
  const nodes = await CreativeAssetGraphRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  return nodes.find((node) =>
    String(node.production_task_id || node.metadata?.production_task_id || "") ===
    String(task.id),
  ) || null;
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

  async fail(id, error, output = {}) {
    const task = await Repository.getById(id);
    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.FAILED,
      output: {
        ...(task?.output || {}),
        ...output,
      },
      error: error?.message || String(error),
      timing: {
        ...(task?.timing || {}),
        completed_at: new Date().toISOString(),
      },
    });
  },

  async ensureAssetNode(id) {
    const task = await Repository.getById(id);
    if (!task) throw new Error("Production task not found");
    if (task.output?.asset_node_id) return task;
    if (task.status !== PRODUCTION_TASK_STATUS.COMPLETED) {
      throw new Error("COMPLETED_PRODUCTION_TASK_REQUIRED_FOR_ASSET_RECOVERY");
    }

    const mediaReference = outputUrl(task.output || {});
    if (!mediaReference) {
      throw new Error("COMPLETED_PRODUCTION_TASK_MEDIA_REFERENCE_REQUIRED");
    }

    let assetNode = await existingAssetNodeForTask(task);
    if (!assetNode) {
      assetNode = await CreativeAssetGraphRuntime.createFromProductionTask({
        task,
        output: task.output || {},
      });
    }

    return Repository.update(id, {
      output: {
        ...(task.output || {}),
        file_url: task.output?.file_url || mediaReference,
        asset_node_id: assetNode.id,
      },
      metadata: {
        ...(task.metadata || {}),
        recovered_asset_node_id: assetNode.id,
        recovered_media_reference: mediaReference,
        asset_node_recovered_without_provider_execution: true,
        asset_node_recovered_at: new Date().toISOString(),
      },
    });
  },

  async complete(id, output = {}) {
    const task = await Repository.getById(id);
    if (!task) throw new Error("Production task not found");

    const mediaReference = outputUrl(output);
    const existingAssetNodeId =
      task.output?.asset_node_id ||
      output.asset_node_id ||
      null;
    let assetNode = existingAssetNodeId
      ? { id: existingAssetNodeId }
      : null;

    if (!assetNode && mediaReference) {
      assetNode = await CreativeAssetGraphRuntime.createFromProductionTask({
        task,
        output,
      });
    }

    const settlement = ProductionTaskSettlementRuntime.apply(task, output);

    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.COMPLETED,
      output: {
        ...(task.output || {}),
        ...output,
        file_url: output.file_url || task.output?.file_url || mediaReference || null,
        asset_node_id: assetNode?.id || null,
      },
      cost: settlement.cost,
      metadata: settlement.metadata,
      timing: {
        ...(task.timing || {}),
        completed_at: new Date().toISOString(),
      },
      error: null,
    });
  },

  async markCompleted(id, output = {}) {
    return this.complete(id, output);
  },

  async poll(id) {
    const current = await Repository.getById(id);
    if (!current) throw new Error("Production task not found");
    if (current.status === PRODUCTION_TASK_STATUS.COMPLETED) return current;
    if (current.status === PRODUCTION_TASK_STATUS.FAILED) return current;
    if (current.status !== PRODUCTION_TASK_STATUS.RUNNING) {
      throw new Error("Only running production tasks can be polled");
    }

    const workerId = taskWorker("poll", id);
    const task = await Repository.leaseRunning(id, {
      worker_id: workerId,
      lease_seconds: 120,
    });
    if (!task) return Repository.getById(id);

    const pending = pendingSettlement(task);
    if (!pending.provider_job_id) {
      await Repository.releaseLease(id, { worker_id: workerId });
      throw new Error("RUNNING_TASK_PROVIDER_JOB_ID_REQUIRED");
    }
    if (!pending.provider) {
      await Repository.releaseLease(id, { worker_id: workerId });
      throw new Error("RUNNING_TASK_PROVIDER_REQUIRED");
    }
    if (!pending.usage?.id) {
      await Repository.releaseLease(id, { worker_id: workerId });
      throw new Error("RUNNING_TASK_USAGE_ID_REQUIRED");
    }

    try {
      const result = await ServiceExecutionRuntime.settle({
        organization_id: task.organization_id,
        provider: pending.provider,
        provider_job_id: pending.provider_job_id,
        usage_id: pending.usage.id,
        pricing: pending.pricing,
        quantity: pending.usage.quantity || 1,
        unit: pending.usage.unit || pending.pricing.unit || "request",
        credential_id: pending.credential_id,
        started_at: pending.started_at,
        provider_status_input:
          task.input?.provider_status ||
          task.metadata?.provider_status ||
          {},
        metadata: {
          task_id: task.id,
          creative_project_id: task.creative_project_id,
          production_graph_id: task.production_graph_id,
          scene_id: task.scene_id,
          shot_id: task.shot_id,
          operation: task.type,
        },
      });

      if (result.pending) {
        return Repository.update(id, {
          status: PRODUCTION_TASK_STATUS.RUNNING,
          provider_id: result.provider || pending.provider,
          output: {
            ...(task.output || {}),
            provider_job_id: pending.provider_job_id,
            provider_status: result.provider_status || "processing",
            provider_poll: result,
            settlement: result.settlement || "RESERVED",
            last_polled_at: new Date().toISOString(),
          },
          error: null,
        });
      }

      if (result.failed) {
        return this.fail(id, new Error(result.error || "Provider job failed"), {
          provider_job_id: pending.provider_job_id,
          provider_status: result.provider_status || "failed",
          provider_poll: result,
          settlement: result.settlement || "RELEASED",
          last_polled_at: new Date().toISOString(),
        });
      }

      return this.complete(id, {
        provider_submission: pending.submission,
        provider_poll: result,
        provider_job_id: pending.provider_job_id,
        provider_status: result.provider_status || "completed",
        provider: result.provider || pending.provider,
        pricing: result.pricing || pending.pricing,
        usage: result.usage || pending.usage,
        billing: result.billing || null,
        settlement: result.settlement || "CHARGED",
        wallet_settlement: result.wallet_settlement || null,
        last_polled_at: new Date().toISOString(),
        output: providerOutput(result),
      });
    } catch (error) {
      return this.fail(id, error, {
        provider_job_id: pending.provider_job_id,
        provider_status: "poll_error",
        last_polled_at: new Date().toISOString(),
      });
    } finally {
      await Repository.releaseLease(id, { worker_id: workerId }).catch(() => false);
    }
  },

  async dispatch(id) {
    const current = await Repository.getById(id);
    if (!current) throw new Error("Production task not found");

    if (current.status === PRODUCTION_TASK_STATUS.COMPLETED) {
      return current;
    }
    if (
      current.status === PRODUCTION_TASK_STATUS.RUNNING &&
      current.output?.provider_job_id
    ) {
      return this.poll(id);
    }
    if (current.status !== PRODUCTION_TASK_STATUS.READY) {
      return current;
    }

    const workerId = taskWorker("dispatch", id);
    const claimed = await Repository.claimForExecution(id, {
      worker_id: workerId,
      lease_seconds: 120,
    });
    if (!claimed) return Repository.getById(id);

    const task = await Repository.update(id, {
      timing: {
        ...(claimed.timing || {}),
        started_at:
          claimed.timing?.started_at ||
          new Date().toISOString(),
      },
    });

    try {
      const providerId = preferredProvider(task);
      const result = await runAIService.execute({
        organization_id: task.organization_id,
        service_id: resolveCreativeService(task),
        provider_id: providerId,
        input: executionInput(task),
        metadata: {
          task_id: task.id,
          creative_project_id: task.creative_project_id,
          production_graph_id: task.production_graph_id,
          scene_id: task.scene_id,
          shot_id: task.shot_id,
          operation: task.type,
          preferred_provider: providerId,
        },
        provider_policy:
          task.input?.provider_policy ||
          task.metadata?.provider_policy ||
          {},
      });

      if (result?.pending) {
        if (!result.provider_job_id) {
          throw new Error("PENDING_PROVIDER_JOB_ID_REQUIRED");
        }

        return Repository.update(id, {
          status: PRODUCTION_TASK_STATUS.RUNNING,
          provider_id: result.provider || providerId || null,
          output: {
            ...(task.output || {}),
            provider_submission: result,
            provider_job_id: result.provider_job_id,
            provider_status: result.provider_status || "processing",
            credential_id: result.credential_id || null,
            pricing: result.pricing || null,
            usage: result.usage || null,
            settlement: result.settlement || "RESERVED",
          },
        });
      }

      return this.complete(id, {
        provider_submission: result,
        provider: result.provider || null,
        model: result.model || null,
        pricing: result.pricing || null,
        usage: result.usage || null,
        billing: result.billing || null,
        settlement: result.settlement || "CHARGED",
        wallet_settlement: result.wallet_settlement || null,
        output: providerOutput(result),
      });
    } catch (error) {
      return this.fail(id, error);
    } finally {
      await Repository.releaseLease(id, { worker_id: workerId }).catch(() => false);
    }
  },
};