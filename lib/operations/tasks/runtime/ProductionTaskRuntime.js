import {
  createProductionTask,
  PRODUCTION_TASK_STATUS,
} from "../documents/ProductionTask";

import * as Repository
from "../repositories/ProductionTaskRepository";

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

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function providerOutput(result = {}) {
  return result?.output || result || {};
}

function outputUrl(result = {}) {
  const output = providerOutput(result);
  const nested = output?.output || output;

  return (
    nested?.url ||
    nested?.file_url ||
    nested?.fileUrl ||
    nested?.image_url ||
    nested?.imageUrl ||
    nested?.video_url ||
    nested?.videoUrl ||
    nested?.audio_url ||
    nested?.audioUrl ||
    nested?.result?.url ||
    nested?.result?.file_url ||
    nested?.result?.video_url ||
    nested?.result?.image_url ||
    nested?.result?.audio_url ||
    nested?.images?.[0]?.url ||
    nested?.files?.[0]?.url ||
    null
  );
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function settledActualCost(output = {}, task = {}) {
  const candidates = [
    output?.pricing?.customer_price,
    output?.usage?.customer_price,
    output?.billing?.usage?.customer_price,
    output?.provider_poll?.pricing?.customer_price,
    output?.provider_poll?.usage?.customer_price,
    output?.provider_submission?.pricing?.customer_price,
    output?.provider_submission?.usage?.customer_price,
    task?.output?.pricing?.customer_price,
    task?.output?.usage?.customer_price,
    task?.output?.provider_submission?.pricing?.customer_price,
    task?.cost?.actual,
  ];

  for (const candidate of candidates) {
    const amount = finite(candidate);
    if (amount !== null && amount >= 0) return amount;
  }
  return 0;
}

function modelFrom(task = {}, submission = {}, usage = {}) {
  return text(
    submission.model ||
    submission.output?.model ||
    submission.output?.output?.model ||
    submission.provider_status_input?.model ||
    submission.output?.provider_status_input?.model ||
    submission.output?.output?.provider_status_input?.model ||
    usage.metadata?.model ||
    task.output?.model ||
    task.input?.model ||
    task.input?.generation?.model ||
    task.input?.provider_configuration?.model ||
    task.input?.provider_configuration?.model_id ||
    task.input?.generation?.provider_configuration?.model ||
    task.input?.generation?.provider_configuration?.model_id ||
    task.metadata?.model,
  );
}

function endpointFrom(task = {}, submission = {}) {
  return text(
    submission.endpoint ||
    submission.submit_endpoint ||
    submission.output?.endpoint ||
    submission.output?.submit_endpoint ||
    submission.output?.output?.endpoint ||
    submission.output?.output?.submit_endpoint ||
    submission.provider_status_input?.endpoint ||
    submission.provider_status_input?.submit_endpoint ||
    submission.output?.provider_status_input?.endpoint ||
    submission.output?.provider_status_input?.submit_endpoint ||
    submission.output?.output?.provider_status_input?.endpoint ||
    submission.output?.output?.provider_status_input?.submit_endpoint ||
    task.output?.endpoint ||
    task.output?.submit_endpoint ||
    task.input?.endpoint ||
    task.input?.submit_endpoint ||
    task.input?.provider_configuration?.endpoint ||
    task.input?.provider_configuration?.submit_endpoint ||
    task.input?.generation?.provider_configuration?.endpoint ||
    task.input?.generation?.provider_configuration?.submit_endpoint,
  );
}

function providerStatusInput(task = {}, submission = {}, usage = {}) {
  const submissionOutput = object(submission.output);
  const nestedOutput = object(submissionOutput.output);
  const configured = {
    ...object(task.input?.provider_status),
    ...object(task.metadata?.provider_status),
    ...object(submission.provider_status_input),
    ...object(submissionOutput.provider_status_input),
    ...object(nestedOutput.provider_status_input),
  };
  const model = modelFrom(task, submission, usage);
  const endpoint = endpointFrom(task, submission);
  const statusUrl = text(
    configured.status_url ||
    configured.statusUrl ||
    submission.status_url ||
    submission.statusUrl ||
    submissionOutput.status_url ||
    submissionOutput.statusUrl ||
    nestedOutput.status_url ||
    nestedOutput.statusUrl,
  );
  const responseUrl = text(
    configured.response_url ||
    configured.responseUrl ||
    configured.result_url ||
    configured.resultUrl ||
    submission.response_url ||
    submission.responseUrl ||
    submissionOutput.response_url ||
    submissionOutput.responseUrl ||
    nestedOutput.response_url ||
    nestedOutput.responseUrl,
  );

  return Object.fromEntries(
    Object.entries({
      ...configured,
      model: model || undefined,
      endpoint: endpoint || undefined,
      submit_endpoint: endpoint || undefined,
      status_url: statusUrl || undefined,
      response_url: responseUrl || undefined,
    }).filter(([, value]) =>
      value !== undefined && value !== null && value !== "",
    ),
  );
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
    provider_status_input: providerStatusInput(task, submission, usage),
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

function pollRetryCount(task = {}) {
  return Math.max(0, Number(task.metadata?.provider_poll_retry_count || 0));
}

function pollRetryLimit(task = {}) {
  const configured = Number(
    task.metadata?.provider_poll_retry_limit ||
    process.env.CREATIVE_PROVIDER_POLL_RETRY_LIMIT,
  );
  return Number.isInteger(configured) && configured > 0 ? configured : 12;
}

function conciseError(error) {
  return String(error?.message || error || "Provider polling failed")
    .replace(/\s+/g, " ")
    .slice(0, 2000);
}

async function dispatchGeneratedMediaReview(task) {
  const { GeneratedMediaPerceptualReviewRuntime } = await import(
    "@/lib/creative/quality/runtime/GeneratedMediaPerceptualReviewRuntime"
  );
  if (!GeneratedMediaPerceptualReviewRuntime.matches(task)) return null;
  return GeneratedMediaPerceptualReviewRuntime.execute(task);
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

  async complete(id, output = {}) {
    const task = await Repository.getById(id);
    if (!task) throw new Error("Production task not found");

    const existingAssetNodeId =
      task.output?.asset_node_id ||
      output.asset_node_id ||
      null;
    let assetNode = existingAssetNodeId
      ? { id: existingAssetNodeId }
      : null;

    if (!assetNode && outputUrl(output)) {
      assetNode = await CreativeAssetGraphRuntime.createFromProductionTask({
        task,
        output,
      });
    }

    const actual = settledActualCost(output, task);

    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.COMPLETED,
      output: {
        ...(task.output || {}),
        ...output,
        asset_node_id: assetNode?.id || null,
      },
      cost: {
        ...(task.cost || {}),
        actual,
      },
      timing: {
        ...(task.timing || {}),
        completed_at: new Date().toISOString(),
      },
      metadata: {
        ...(task.metadata || {}),
        provider_poll_retry_count: 0,
        provider_poll_last_error: null,
      },
      error: null,
    });
  },

  async markCompleted(id, output = {}) {
    return this.complete(id, output);
  },

  async poll(id) {
    const task = await Repository.getById(id);
    if (!task) throw new Error("Production task not found");
    if (task.status === PRODUCTION_TASK_STATUS.COMPLETED) return task;
    if (task.status === PRODUCTION_TASK_STATUS.FAILED) return task;
    if (task.status !== PRODUCTION_TASK_STATUS.RUNNING) {
      throw new Error("Only running production tasks can be polled");
    }

    const pending = pendingSettlement(task);
    if (!pending.provider_job_id) {
      throw new Error("RUNNING_TASK_PROVIDER_JOB_ID_REQUIRED");
    }
    if (!pending.provider) {
      throw new Error("RUNNING_TASK_PROVIDER_REQUIRED");
    }
    if (!pending.usage?.id) {
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
        provider_status_input: pending.provider_status_input,
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
            provider_status_input: pending.provider_status_input,
            provider_poll: result,
            settlement: result.settlement || "RESERVED",
            last_polled_at: new Date().toISOString(),
          },
          metadata: {
            ...(task.metadata || {}),
            provider_poll_retry_count: 0,
            provider_poll_last_error: null,
          },
          error: null,
        });
      }

      if (result.failed) {
        return this.fail(id, new Error(result.error || "Provider job failed"), {
          provider_job_id: pending.provider_job_id,
          provider_status: result.provider_status || "failed",
          provider_status_input: pending.provider_status_input,
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
        provider_status_input: pending.provider_status_input,
        provider: result.provider || pending.provider,
        pricing: result.pricing || pending.pricing,
        usage: result.usage || pending.usage,
        billing: result.billing || null,
        settlement: result.settlement || "CHARGED",
        last_polled_at: new Date().toISOString(),
        output: providerOutput(result),
      });
    } catch (error) {
      const retryCount = pollRetryCount(task) + 1;
      const retryLimit = pollRetryLimit(task);
      const message = conciseError(error);

      if (retryCount > retryLimit) {
        return this.fail(id, new Error(
          `PROVIDER_POLL_RETRY_EXHAUSTED:${retryCount - 1}:${message}`,
        ), {
          provider_job_id: pending.provider_job_id,
          provider_status: "poll_retry_exhausted",
          provider_status_input: pending.provider_status_input,
          settlement: task.output?.settlement || "RESERVED",
          last_polled_at: new Date().toISOString(),
        });
      }

      return Repository.update(id, {
        status: PRODUCTION_TASK_STATUS.RUNNING,
        provider_id: pending.provider,
        output: {
          ...(task.output || {}),
          provider_job_id: pending.provider_job_id,
          provider_status: "poll_retry",
          provider_status_input: pending.provider_status_input,
          settlement: task.output?.settlement || "RESERVED",
          last_polled_at: new Date().toISOString(),
        },
        metadata: {
          ...(task.metadata || {}),
          provider_poll_retry_count: retryCount,
          provider_poll_retry_limit: retryLimit,
          provider_poll_last_error: message,
          provider_poll_last_error_at: new Date().toISOString(),
        },
        error: null,
      });
    }
  },

  async dispatch(id) {
    const task = await Repository.getById(id);
    if (!task) throw new Error("Production task not found");

    if (task.status === PRODUCTION_TASK_STATUS.COMPLETED) {
      return task;
    }
    if (
      task.status === PRODUCTION_TASK_STATUS.RUNNING &&
      task.output?.provider_job_id
    ) {
      return this.poll(id);
    }

    const generatedMediaReview = await dispatchGeneratedMediaReview(task);
    if (generatedMediaReview) return generatedMediaReview;

    await Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.RUNNING,
      timing: {
        ...(task.timing || {}),
        started_at:
          task.timing?.started_at ||
          new Date().toISOString(),
      },
    });

    try {
      const result = await runAIService.execute({
        organization_id: task.organization_id,
        service_id: resolveCreativeService(task),
        provider_id: task.provider_id || null,
        input: task.input,
        metadata: {
          task_id: task.id,
          creative_project_id: task.creative_project_id,
          production_graph_id: task.production_graph_id,
          scene_id: task.scene_id,
          shot_id: task.shot_id,
          operation: task.type,
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

        const statusInput = providerStatusInput(task, result, result.usage || {});
        return Repository.update(id, {
          status: PRODUCTION_TASK_STATUS.RUNNING,
          provider_id: result.provider || task.provider_id || null,
          output: {
            ...(task.output || {}),
            provider_submission: result,
            provider_job_id: result.provider_job_id,
            provider_status: result.provider_status || "processing",
            provider_status_input: statusInput,
            model: result.model || statusInput.model || null,
            endpoint: statusInput.endpoint || null,
            credential_id: result.credential_id || null,
            pricing: result.pricing || null,
            usage: result.usage || null,
            settlement: result.settlement || "RESERVED",
          },
          metadata: {
            ...(task.metadata || {}),
            provider_poll_retry_count: 0,
            provider_poll_last_error: null,
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
      });
    } catch (error) {
      return this.fail(id, error);
    }
  },
};
