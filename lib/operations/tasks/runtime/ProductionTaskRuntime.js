import crypto from "node:crypto";

import {
  createProductionTask,
  PRODUCTION_TASK_STATUS,
} from "../documents/ProductionTask";

import * as Repository from "../repositories/ProductionTaskRepository";

import { runAIService } from "@/lib/platform/service-runtime/ai";
import { resolveCreativeService } from "@/lib/creative/services/CreativeServiceResolver";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

function providerOutput(result = {}) {
  return result?.output || result || {};
}

function outputUrl(result = {}) {
  const output = providerOutput(result);
  const nested = output?.output || output;
  return nested?.url || nested?.file_url || nested?.image_url ||
    nested?.video_url || nested?.audio_url || nested?.images?.[0]?.url ||
    nested?.files?.[0]?.url || null;
}

function workerId(input = {}) {
  return String(
    input.worker_id ||
    process.env.AVANTIQO_WORKER_ID ||
    `creative-worker:${process.env.VERCEL_REGION || "local"}:${process.pid}`,
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
    return Repository.create(createProductionTask(input));
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async markReady(id) {
    return Repository.update(id, { status: PRODUCTION_TASK_STATUS.READY });
  },

  async fail(id, error, options = {}) {
    const task = await Repository.getById(id);
    if (!task) throw new Error("Production task not found");

    if (options.lease_token) {
      return Repository.failAttempt({
        id,
        organization_id: task.organization_id,
        lease_token: options.lease_token,
        error_message: error?.message || String(error),
        retryable: options.retryable !== false,
        retry_delay_seconds: options.retry_delay_seconds || 30,
      });
    }

    return Repository.finalize({
      id,
      organization_id: task.organization_id,
      status: PRODUCTION_TASK_STATUS.FAILED,
      error_message: error?.message || String(error),
    });
  },

  async complete(id, output = {}, options = {}) {
    const task = await Repository.getById(id);
    if (!task) throw new Error("Production task not found");
    if (task.status === PRODUCTION_TASK_STATUS.COMPLETED) return task;

    const existingAssetNodeId = task.output?.asset_node_id || output.asset_node_id || null;
    let assetNode = existingAssetNodeId ? { id: existingAssetNodeId } : null;

    if (!assetNode && outputUrl(output)) {
      assetNode = await CreativeAssetGraphRuntime.createFromProductionTask({ task, output });
    }

    return Repository.finalize({
      id,
      organization_id: task.organization_id,
      status: PRODUCTION_TASK_STATUS.COMPLETED,
      output: {
        ...(task.output || {}),
        ...output,
        asset_node_id: assetNode?.id || null,
      },
      lease_token: options.lease_token || null,
    });
  },

  async markCompleted(id, output = {}) {
    return this.complete(id, output);
  },

  async dispatch(id, options = {}) {
    const original = await Repository.getById(id);
    if (!original) throw new Error("Production task not found");
    if (original.status === PRODUCTION_TASK_STATUS.COMPLETED) return original;

    const task = await Repository.claim({
      id,
      organization_id: original.organization_id,
      worker_id: workerId(options),
      lease_seconds: options.lease_seconds || 900,
    });

    if (!task) return null;
    const leaseToken = task.lease_token;
    if (!leaseToken) throw new Error("PRODUCTION_TASK_LEASE_TOKEN_MISSING");

    try {
      const result = await runAIService.execute({
        organization_id: task.organization_id,
        service_id: resolveCreativeService(task),
        provider_id: task.provider_id || null,
        input: task.input,
        metadata: {
          task_id: task.id,
          execution_id: crypto.randomUUID(),
          creative_project_id: task.creative_project_id,
          production_graph_id: task.production_graph_id,
          scene_id: task.scene_id,
          shot_id: task.shot_id,
          operation: task.type,
          attempt_count: task.attempt_count,
        },
        provider_policy: task.input?.provider_policy || task.metadata?.provider_policy || {},
      });

      if (result?.pending) {
        const providerJobId = result.provider_job_id || null;
        if (!providerJobId) {
          throw new Error("PENDING_PROVIDER_JOB_ID_REQUIRED");
        }

        return Repository.submitPending({
          id,
          organization_id: task.organization_id,
          lease_token: leaseToken,
          provider_id: result.provider || task.provider_id || null,
          output: {
            ...(task.output || {}),
            provider_submission: result,
            provider_job_id: providerJobId,
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
        output: providerOutput(result),
      }, { lease_token: leaseToken });
    } catch (error) {
      return this.fail(id, error, {
        lease_token: leaseToken,
        retryable: error?.retryable !== false,
        retry_delay_seconds: error?.retry_delay_seconds || 30,
      });
    }
  },
};
