import {
  createProductionTask,
  PRODUCTION_TASK_STATUS,
} from "../documents/ProductionTask";

import * as Repository from "../repositories/ProductionTaskRepository";

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
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  getRunwayTaskStatus,
} from "@/lib/platform/service-runtime/providers/runway/RunwayProvider";

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null,
  ) ?? null;
}

function normalizeProviderResult(execution = {}) {
  const providerResult = execution?.output || execution || {};
  const output = providerResult?.output || providerResult || {};

  return {
    provider: firstValue(execution?.provider, providerResult?.provider),
    model: firstValue(execution?.model, providerResult?.model),
    pricing: execution?.pricing || providerResult?.pricing || null,
    usage: execution?.usage || providerResult?.usage || null,
    billing: execution?.billing || providerResult?.billing || null,
    output,
    image_url: firstValue(
      output?.image_url,
      output?.images?.[0]?.url,
      output?.image?.url,
      providerResult?.image_url,
    ),
    video_url: firstValue(
      output?.video_url,
      output?.videos?.[0]?.url,
      output?.url,
      providerResult?.video_url,
    ),
    video_job_id: firstValue(
      execution?.async_job?.job_id,
      output?.video_job_id,
      output?.job_id,
      output?.task_id,
      providerResult?.video_job_id,
    ),
    status: String(
      firstValue(
        execution?.async_job?.status,
        output?.status,
        providerResult?.status,
        "",
      ),
    ).toUpperCase(),
  };
}

function executionCost(execution = {}, task = {}) {
  const normalized = normalizeProviderResult(execution);
  const pricing = normalized.pricing || {};
  const actual = Number(
    pricing.customer_price ??
    normalized.billing?.customer_price ??
    normalized.usage?.customer_price ??
    task.cost?.actual ??
    0,
  );
  const estimated = Number(
    task.cost?.estimated ??
    pricing.customer_price ??
    0,
  );

  return {
    currency:
      pricing.currency ||
      normalized.usage?.currency ||
      task.cost?.currency ||
      "USD",
    estimated,
    actual,
    approved: task.cost?.approved === true,
  };
}

function structuredError(error) {
  return {
    message: error?.message || String(error),
    name: error?.name || "Error",
    quality_review: error?.quality_review || null,
    contact_sheet_url: error?.contact_sheet_url || null,
    code: error?.code || null,
    captured_at: new Date().toISOString(),
  };
}

// CREATIVE_RUNTIME_EVIDENCE_REFERENCE_RECOVERY_V2
function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function assetReferenceIdentity(value) {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return String(
    value.id ||
    value.asset_id ||
    value.creative_asset_id ||
    value.source_asset_id ||
    value.reference_asset_id ||
    value.metadata?.source_asset_id ||
    value.metadata?.creative_asset_id ||
    "",
  ) || null;
}

function assetAliases(asset = {}) {
  return [...new Set([
    asset.id,
    asset.asset_id,
    asset.creative_asset_id,
    asset.source_asset_id,
    asset.reference_asset_id,
    asset.metadata?.source_asset_id,
    asset.metadata?.creative_asset_id,
  ].filter(Boolean).map(String))];
}

function collectDeclaredAssetReferences(value, key = "", output = []) {
  if (!value) return output;
  const assetKey = /(asset|reference|evidence)/i.test(String(key));

  if (Array.isArray(value)) {
    for (const entry of value) {
      const identity = assetReferenceIdentity(entry);
      if (assetKey && identity) output.push(entry);
      collectDeclaredAssetReferences(entry, key, output);
    }
    return output;
  }

  if (typeof value === "object") {
    const identity = assetReferenceIdentity(value);
    if (assetKey && identity) output.push(value);
    for (const [childKey, childValue] of Object.entries(value)) {
      collectDeclaredAssetReferences(childValue, childKey, output);
    }
    return output;
  }

  if (assetKey) output.push(value);
  return output;
}

function uniqueAssetReferences(values = []) {
  const seen = new Set();
  const output = [];

  for (const value of values.flat(Infinity).filter(Boolean)) {
    const identity = assetReferenceIdentity(value);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    output.push(value);
  }

  return output;
}

async function resolveAssetReference(reference) {
  if (!reference) return null;

  const directUrl = firstValue(
    reference?.image_url,
    reference?.file_url,
    reference?.url,
    reference?.thumbnail_url,
  );
  if (typeof reference === "object" && directUrl) return reference;

  const identity = assetReferenceIdentity(reference);
  if (!identity) return typeof reference === "object" ? reference : null;

  try {
    const resolved = await CreativeAssetsRuntime.get(identity);
    return resolved
      ? {
          ...resolved,
          ...(typeof reference === "object" ? reference : {}),
        }
      : null;
  } catch {
    return typeof reference === "object" ? reference : null;
  }
}

async function resolveTaskAssets(task) {
  const declared = [];
  collectDeclaredAssetReferences(
    task.input?.specification,
    "specification_reference_assets",
    declared,
  );
  collectDeclaredAssetReferences(
    task.input?.generation_contract,
    "generation_contract_reference_assets",
    declared,
  );

  const references = uniqueAssetReferences([
    ...list(task.input?.reference_assets),
    ...list(task.input?.assets),
    ...list(task.input?.authorized_reference_asset_ids),
    ...list(task.input?.metadata?.authorized_reference_asset_ids),
    ...declared,
  ]);

  const direct = (
    await Promise.all(references.map(resolveAssetReference))
  ).filter(Boolean);

  const dependencies = [];

  for (const dependencyId of task.depends_on || []) {
    const dependency = await Repository.getById(dependencyId, {
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    });
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
      dependencies.push({
        id: dependency.output?.asset_id || dependency.id,
        url,
        image_url: url,
        file_url: url,
        source_task_id: dependency.id,
        source_node_id: dependency.metadata?.node_id || null,
      });
    }
  }

  return uniqueAssetReferences([...dependencies, ...direct]);
}

// CREATIVE_GENERATED_FRAME_QA_AND_CORRECTION_LOOP_V5
function resolvedMediaUrl(value = {}) {
  return firstValue(
    value?.image_url,
    value?.file_url,
    value?.video_url,
    value?.url,
    value?.asset?.image_url,
    value?.asset?.file_url,
    value?.asset?.video_url,
    value?.asset?.url,
    value?.output?.image_url,
    value?.output?.file_url,
    value?.output?.video_url,
    value?.output?.url,
  );
}

async function resolveDependencyAssets(task = {}) {
  const output = [];
  for (const dependencyId of task.depends_on || []) {
    const dependency = await Repository.getById(dependencyId, {
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    });
    if (!dependency) continue;
    const url = resolvedMediaUrl(dependency.output || dependency);
    if (!url) continue;
    output.push({
      id: dependency.output?.asset_id || dependency.id,
      url,
      image_url: url,
      file_url: url,
      source_task_id: dependency.id,
      source_node_id: dependency.metadata?.node_id || null,
      dependency_task_type: dependency.type || null,
      generated_dependency: true,
    });
  }
  return output;
}

async function priorCompletedMasterStillUrls(task = {}) {
  if (String(task.type || "").toUpperCase() !== "QUALITY_REVIEW") {
    return [];
  }

  const tasks = await Repository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  const dependencyIds = new Set(list(task.depends_on).map(String));

  return [...new Set(
    tasks
      .filter((candidate) =>
        String(candidate.type || "").toUpperCase() === "GENERATE_IMAGE" &&
        ["COMPLETED", "APPROVED"].includes(
          String(candidate.status || "").toUpperCase(),
        ) &&
        !dependencyIds.has(String(candidate.id)),
      )
      .map((candidate) => resolvedMediaUrl(candidate.output || candidate))
      .filter(Boolean),
  )].slice(0, 6);
}

function qualityCorrections(captured = {}) {
  return [...new Set([
    ...list(captured.quality_review?.correction_instructions),
    ...list(captured.quality_review?.critical_failures),
    ...list(captured.quality_review?.issues).map((issue) =>
      typeof issue === "string"
        ? issue
        : issue?.correction || issue?.message || issue?.issue,
    ),
    captured.message,
  ].filter(Boolean).map(String))];
}

async function resetRejectedMasterStill({ task, captured }) {
  if (String(task?.type || "").toUpperCase() !== "QUALITY_REVIEW") {
    return null;
  }
  if (!captured.quality_review) return null;

  const cycle = Number(task.metadata?.quality_revision_cycle || 0) + 1;
  const maximum = Number(task.metadata?.max_quality_revisions || 3);
  if (cycle > maximum) return null;

  const dependencyId = list(task.depends_on)[0];
  if (!dependencyId) return null;
  const dependency = await Repository.getById(dependencyId, {
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  if (!dependency || String(dependency.type || "").toUpperCase() !== "GENERATE_IMAGE") {
    return null;
  }

  const corrections = qualityCorrections(captured);
  const rejectedVersion = {
    asset_id: dependency.output?.asset_id || null,
    url: resolvedMediaUrl(dependency.output || dependency) || null,
    quality_review: captured.quality_review,
    rejected_at: new Date().toISOString(),
    revision_cycle: cycle,
  };

  await Repository.update(
    dependency.id,
    {
      status: PRODUCTION_TASK_STATUS.WAITING,
      output: {
        ...(dependency.output || {}),
        rejected_versions: [
          ...list(dependency.output?.rejected_versions),
          rejectedVersion,
        ].slice(-3),
      },
      review: {
        ...(dependency.review || {}),
        required: true,
        approved: false,
        notes: corrections.join("\n"),
      },
      metadata: {
        ...(dependency.metadata || {}),
        quality_revision_cycle: cycle,
        correction_instructions: corrections,
        provider_status: "WAITING_FOR_QUALITY_CORRECTION",
      },
      worker_id: null,
      lease_expires_at: null,
      error: null,
    },
    {
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    },
  );

  return Repository.update(
    task.id,
    {
      status: PRODUCTION_TASK_STATUS.WAITING,
      output: {
        ...(task.output || {}),
        last_quality_rejection: rejectedVersion,
      },
      review: {
        ...(task.review || {}),
        approved: false,
        notes: corrections.join("\n"),
      },
      metadata: {
        ...(task.metadata || {}),
        quality_revision_cycle: cycle,
        correction_instructions: corrections,
        provider_status: "WAITING_FOR_CORRECTED_DEPENDENCY",
      },
      worker_id: null,
      lease_expires_at: null,
      error: null,
    },
    {
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    },
  );
}

async function createMediaAsset({ task, execution, type, url }) {
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

  return Repository.update(
    task.id,
    {
      status: PRODUCTION_TASK_STATUS.COMPLETED,
      output: {
        ...(task.output || {}),
        provider_submission: execution,
        asset_id: asset.id,
        asset,
        url,
        image_url: type === "IMAGE" ? url : null,
        video_url: type === "VIDEO" ? url : null,
        usage: normalized.usage,
        billing: normalized.billing,
      },
      cost: executionCost(execution, task),
      timing: {
        ...(task.timing || {}),
        completed_at: new Date().toISOString(),
      },
      metadata: {
        ...(task.metadata || {}),
        provider: normalized.provider,
        provider_status: "COMPLETED",
        worker_id: null,
      },
      worker_id: null,
      lease_expires_at: null,
      error: null,
    },
    {
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    },
  );
}

function resolveRunwayOutput(status = {}) {
  if (Array.isArray(status?.output)) return status.output[0] || null;
  return firstValue(
    status?.output?.url,
    status?.output?.video_url,
    status?.video_url,
    status?.url,
  );
}

async function releaseAsyncReservation(task, error) {
  await ServiceExecutionRuntime.failAsync({
    submission: task.output?.provider_submission,
    error,
  }).catch(() => null);
}

export const ProductionTaskRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async get(id, scope = {}) {
    return Repository.getById(id, scope);
  },

  async create(input = {}) {
    return Repository.create(createProductionTask(input));
  },

  async update(id, values = {}, scope = {}) {
    return Repository.update(id, values, scope);
  },

  async markReady(id, scope = {}) {
    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.READY,
    }, scope);
  },

  async fail(id, error) {
    const task = await Repository.getById(id);
    const captured = structuredError(error);

    const corrected = await resetRejectedMasterStill({
      task,
      captured,
    });
    if (corrected) return corrected;

    return Repository.update(
      id,
      {
        status: PRODUCTION_TASK_STATUS.FAILED,
        error: captured.message,
        review: {
          ...(task?.review || {}),
          approved: false,
          notes:
            captured.quality_review?.correction_instructions?.join("\n") ||
            captured.message,
        },
        metadata: {
          ...(task?.metadata || {}),
          provider_status: "FAILED",
          structured_failure: captured,
          quality_review: captured.quality_review,
          correction_instructions:
            captured.quality_review?.correction_instructions || [],
          contact_sheet_url: captured.contact_sheet_url,
        },
        worker_id: null,
        lease_expires_at: null,
      },
      {
        organization_id: task?.organization_id,
        creative_project_id: task?.creative_project_id,
      },
    );
  },

  async complete(id, output = {}) {
    const task = await Repository.getById(id);
    return Repository.update(
      id,
      {
        status: PRODUCTION_TASK_STATUS.COMPLETED,
        output: {
          ...(task?.output || {}),
          ...output,
        },
        timing: {
          ...(task?.timing || {}),
          completed_at: new Date().toISOString(),
        },
        worker_id: null,
        lease_expires_at: null,
        error: null,
      },
      {
        organization_id: task?.organization_id,
        creative_project_id: task?.creative_project_id,
      },
    );
  },

  async markCompleted(id, output = {}) {
    return this.complete(id, output);
  },

  async dispatch(id) {
    const task = await Repository.getById(id);
    if (!task) throw new Error(`Production task not found: ${id}`);

    if ([
      PRODUCTION_TASK_STATUS.COMPLETED,
      PRODUCTION_TASK_STATUS.SKIPPED,
    ].includes(task.status)) {
      return task;
    }

    const attempt = Number(task.metadata?.attempt || 0) + 1;
    const maxAttempts = Number(task.metadata?.max_attempts || 3);
    if (attempt > maxAttempts) {
      return this.fail(id, new Error(`Maximum attempts exceeded for ${id}`));
    }

    const dependencyAssets = await resolveDependencyAssets(task);
    const assets = await resolveTaskAssets(task);
    const comparisonImages = await priorCompletedMasterStillUrls(task);
    const inspectedImage = resolvedMediaUrl(dependencyAssets[0] || {});
    const authorizedReferenceAssetIds = [...new Set([
      ...list(task.input?.authorized_reference_asset_ids),
      ...list(task.input?.metadata?.authorized_reference_asset_ids),
      ...assets.flatMap(assetAliases),
    ].filter(Boolean).map(String))];
    const sourceAsset = assets[0] || null;
    const corrections = [
      ...(task.input?.specification?.quality_corrections || []),
      ...(task.metadata?.correction_instructions || []),
    ];
    const specification = {
      ...(task.input?.specification || {}),
      quality_corrections: [...new Set(corrections.filter(Boolean))],
    };

    await Repository.update(
      id,
      {
        status: PRODUCTION_TASK_STATUS.RUNNING,
        timing: {
          ...(task.timing || {}),
          started_at: task.timing?.started_at || new Date().toISOString(),
        },
        metadata: {
          ...(task.metadata || {}),
          attempt,
          provider_status: "SUBMITTING",
        },
        error: null,
      },
      {
        organization_id: task.organization_id,
        creative_project_id: task.creative_project_id,
      },
    );

    try {
      const result = await runAIService.execute({
        organization_id: task.organization_id,
        service_id: resolveCreativeService(task),
        estimated_cost: task.cost?.estimated || 0,
        operation: task.type,
        input: {
          ...(task.input || {}),
          specification,
          authorized_reference_asset_ids: authorizedReferenceAssetIds,
          metadata: {
            ...(task.input?.metadata || {}),
            authorized_reference_asset_ids: authorizedReferenceAssetIds,
          },
          duration_seconds: Number(
            task.input?.duration_seconds ||
            task.timing?.estimated_seconds ||
            0,
          ),
          assets: { selectedAssets: assets },
          image:
            String(task.type || "").toUpperCase() === "QUALITY_REVIEW"
              ? inspectedImage
              : task.input?.image,
          inspected_image: inspectedImage,
          comparison_images: comparisonImages,
          source_image: firstValue(
            sourceAsset?.image_url,
            sourceAsset?.file_url,
            sourceAsset?.url,
          ),
          production_task_id: task.id,
        },
        metadata: {
          task,
          production_contract: "atomic_reference_grounded_shots_v1",
        },
      });

      const normalized = normalizeProviderResult(result);

      if (normalized.image_url) {
        return createMediaAsset({
          task,
          execution: result,
          type: "IMAGE",
          url: normalized.image_url,
        });
      }

      if (normalized.video_url && !normalized.video_job_id) {
        return createMediaAsset({
          task,
          execution: result,
          type: "VIDEO",
          url: normalized.video_url,
        });
      }

      if (normalized.video_job_id) {
        return Repository.update(
          id,
          {
            status: PRODUCTION_TASK_STATUS.RUNNING,
            output: {
              ...(task.output || {}),
              provider_submission: result,
            },
            cost: {
              ...(task.cost || {}),
              currency:
                normalized.pricing?.currency ||
                task.cost?.currency ||
                "USD",
              estimated: Number(
                normalized.pricing?.customer_price ||
                task.cost?.estimated ||
                0,
              ),
            },
            metadata: {
              ...(task.metadata || {}),
              attempt,
              provider: normalized.provider,
              provider_job_id: normalized.video_job_id,
              provider_status: normalized.status || "PROCESSING",
            },
          },
          {
            organization_id: task.organization_id,
            creative_project_id: task.creative_project_id,
          },
        );
      }

      return Repository.update(
        id,
        {
          status: PRODUCTION_TASK_STATUS.COMPLETED,
          output: {
            ...(task.output || {}),
            provider_submission: result,
            result: normalized.output,
            usage: normalized.usage,
            billing: normalized.billing,
          },
          cost: executionCost(result, task),
          timing: {
            ...(task.timing || {}),
            completed_at: new Date().toISOString(),
          },
          worker_id: null,
          lease_expires_at: null,
          error: null,
        },
        {
          organization_id: task.organization_id,
          creative_project_id: task.creative_project_id,
        },
      );
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
    if (!jobId || provider !== "runway") return task;

    try {
      const status = await getRunwayTaskStatus(jobId);
      const providerStatus = String(status?.status || "").toUpperCase();

      if (["FAILED", "CANCELLED", "CANCELED"].includes(providerStatus)) {
        const error = new Error(
          status?.failure ||
          status?.error ||
          `Provider job ${jobId} failed`,
        );
        await releaseAsyncReservation(task, error);
        return this.fail(id, error);
      }

      if (["SUCCEEDED", "COMPLETED", "SUCCESS"].includes(providerStatus)) {
        const url = resolveRunwayOutput(status);
        if (!url) {
          const error = new Error(
            `Provider job ${jobId} completed without video output`,
          );
          await releaseAsyncReservation(task, error);
          return this.fail(id, error);
        }

        const finalized = await ServiceExecutionRuntime.completeAsync({
          submission: task.output?.provider_submission,
          result: status,
        });

        return createMediaAsset({
          task,
          execution: finalized,
          type: "VIDEO",
          url,
        });
      }

      return Repository.update(
        id,
        {
          metadata: {
            ...(task.metadata || {}),
            provider_status: providerStatus || "PROCESSING",
            last_polled_at: new Date().toISOString(),
          },
        },
        {
          organization_id: task.organization_id,
          creative_project_id: task.creative_project_id,
        },
      );
    } catch (error) {
      return Repository.update(
        id,
        {
          metadata: {
            ...(task.metadata || {}),
            last_poll_error: error?.message || String(error),
            last_polled_at: new Date().toISOString(),
          },
        },
        {
          organization_id: task.organization_id,
          creative_project_id: task.creative_project_id,
        },
      );
    }
  },
};
