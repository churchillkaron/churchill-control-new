import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
} from "../documents/CreativeAssetNode";
import * as Repository from "../repositories/CreativeAssetGraphRepository";
import {
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

function first(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function unwrapOutput(output = {}) {
  let current = output;
  const seen = new Set();
  while (
    current && typeof current === "object" &&
    current.output && typeof current.output === "object" &&
    !seen.has(current)
  ) {
    seen.add(current);
    current = current.output;
  }
  return current || {};
}

function resolveUrl(output = {}) {
  return first(
    output.url,
    output.file_url,
    output.fileUrl,
    output.image_url,
    output.imageUrl,
    output.video_url,
    output.videoUrl,
    output.audio_url,
    output.audioUrl,
    output.thumbnail_url,
    output.thumbnailUrl,
    output.images?.[0]?.url,
    output.files?.[0]?.url,
  );
}

function inferType(task = {}, output = {}) {
  const explicit = first(
    output.type,
    output.media_type,
    output.media_kind,
    output.mime_type?.split("/")?.[0],
  );
  if (explicit) return String(explicit).toUpperCase();
  const taskType = String(task.type || task.capability || "").toUpperCase();
  if (taskType.includes("VIDEO") || taskType.includes("RENDER")) return "VIDEO";
  if (taskType.includes("VOICE")) return "VOICE";
  if (taskType.includes("MUSIC")) return "MUSIC";
  if (taskType.includes("SFX")) return "SFX";
  if (taskType.includes("AUDIO")) return "AUDIO";
  if (taskType.includes("SUBTITLE")) return "SUBTITLE";
  if (taskType.includes("LOGO")) return "LOGO";
  if (taskType.includes("TEMPLATE")) return "TEMPLATE";
  return "IMAGE";
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function productionOutputIdentity(task, stored) {
  if (!task?.id) throw new Error("PRODUCTION_TASK_ID_REQUIRED");
  if (!stored?.storage_path || !stored?.checksum) {
    throw new Error("PRIVATE_PRODUCTION_OUTPUT_EVIDENCE_REQUIRED");
  }
  return crypto.createHash("sha256").update(JSON.stringify({
    production_task_id: task.id,
    storage_path: stored.storage_path,
    checksum: stored.checksum,
  })).digest("hex");
}

function uniqueViolation(error) {
  return error?.code === "23505" ||
    String(error?.message || "").toLowerCase().includes("duplicate key");
}

async function findByOutputIdentity(task, identity) {
  const nodes = await Repository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  return nodes.find((node) =>
    node.production_task_id === task.id &&
    node.metadata?.production_output_identity === identity,
  ) || null;
}

async function inspectStoredMedia({ task, normalized, stored }) {
  try {
    const delivery = await CreativeStorageRuntime.createSignedUrl(
      stored.storage_path,
      900,
    );
    const inspection = await CreativeMediaInspectionRuntime.inspect({
      url: delivery.signed_url,
      file_name: normalized.file_name || normalized.name || null,
      mime_type:
        stored.content_type ||
        normalized.technical?.mime_type ||
        normalized.mime_type ||
        null,
      policy:
        task.input?.inspection_policy ||
        task.metadata?.inspection_policy ||
        {},
    });
    if (inspection.technical?.checksum_sha256 !== stored.checksum) {
      throw new Error("PRODUCTION_OUTPUT_STORAGE_CHECKSUM_MISMATCH");
    }
    return inspection;
  } catch (error) {
    if (error?.message === "PRODUCTION_OUTPUT_STORAGE_CHECKSUM_MISMATCH") {
      throw error;
    }
    return {
      status: "PARTIAL",
      reason: error?.message || String(error),
      technical: {},
    };
  }
}

async function createFromStoredProductionOutput({ task, output = {}, stored }) {
  if (!task?.organization_id) {
    throw new Error("Production task organization_id required");
  }
  if (!task?.creative_project_id) {
    throw new Error("Production task creative_project_id required");
  }
  if (!stored?.storage_path || !stored?.checksum) {
    throw new Error("PRIVATE_PRODUCTION_OUTPUT_EVIDENCE_REQUIRED");
  }

  const normalized = unwrapOutput(output);
  const identity = productionOutputIdentity(task, stored);
  const existing = await findByOutputIdentity(task, identity);
  if (existing) return existing;

  const inspection = await inspectStoredMedia({ task, normalized, stored });
  const technical = {
    ...(inspection.technical || {}),
    ...(normalized.technical || {}),
    mime_type: first(
      stored.content_type,
      normalized.technical?.mime_type,
      normalized.mime_type,
      inspection.technical?.mime_type,
    ),
    width: first(
      normalized.technical?.width,
      normalized.width,
      inspection.technical?.width,
    ),
    height: first(
      normalized.technical?.height,
      normalized.height,
      inspection.technical?.height,
    ),
    duration_seconds: first(
      normalized.technical?.duration_seconds,
      normalized.duration_seconds,
      normalized.duration,
      inspection.technical?.duration_seconds,
    ),
    checksum: stored.checksum,
    byte_size: finite(stored.byte_size),
  };

  const pricing = output.pricing || output.provider_submission?.pricing || {};
  const usage = output.usage || output.provider_submission?.usage || {};
  const actualCost = first(
    pricing.customer_price,
    usage.customer_price,
    task.cost?.actual,
  );
  const currency = first(
    pricing.currency,
    usage.currency,
    task.cost?.currency,
  );

  const node = createCreativeAssetNode({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_task_id: task.id,
    type: inferType(task, {
      ...normalized,
      media_kind: technical.media_kind || normalized.media_kind,
      mime_type: technical.mime_type || normalized.mime_type,
    }),
    status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
    name: normalized.name || task.title || "",
    description: normalized.description || task.description || "",
    url: null,
    storage_path: stored.storage_path,
    lineage: {
      source: "production_task",
      provider_id:
        normalized.provider_id || output.provider || task.provider_id || null,
      capability:
        normalized.capability ||
        task.capability ||
        task.service_code ||
        null,
      generation_version:
        normalized.generation_version ||
        task.metadata?.generation_version ||
        1,
    },
    technical,
    intelligence: {
      ...(normalized.intelligence || {}),
      quality_score: first(
        normalized.intelligence?.quality_score,
        normalized.quality_score,
        null,
      ),
      brand_match_score: first(
        normalized.intelligence?.brand_match_score,
        normalized.brand_match_score,
        null,
      ),
      reuse_score: first(
        normalized.intelligence?.reuse_score,
        normalized.reuse_score,
        null,
      ),
      safety_status: first(
        normalized.intelligence?.safety_status,
        normalized.safety_status,
        "UNKNOWN",
      ),
      tags: first(normalized.intelligence?.tags, normalized.tags, []),
      detected_products: first(
        normalized.intelligence?.detected_products,
        normalized.detected_products,
        [],
      ),
      detected_people: first(
        normalized.intelligence?.detected_people,
        normalized.detected_people,
        [],
      ),
      detected_locations: first(
        normalized.intelligence?.detected_locations,
        normalized.detected_locations,
        [],
      ),
    },
    cost: {
      currency: currency || null,
      estimated: finite(task.cost?.estimated),
      actual: finite(actualCost),
      saved_by_reuse: null,
    },
    reuse: { reusable: false, approved_for_reuse: false },
    review: {
      ai_reviewed: false,
      human_reviewed: false,
      approved: false,
    },
    metadata: {
      production_output_identity: identity,
      task_type: task.type,
      delivery_mode: stored.delivery_mode || "PRIVATE_SIGNED_URL",
      storage_bucket: "creative-assets",
      byte_size: finite(stored.byte_size),
      content_type: stored.content_type || null,
      requirements: task.input?.requirements || null,
      restrictions:
        normalized.restrictions || task.input?.restrictions || {},
      inspection_status: inspection.status,
      inspection_reason: inspection.reason || null,
      provider_output_url_persisted: false,
    },
  });

  try {
    return await Repository.create(node);
  } catch (error) {
    if (!uniqueViolation(error)) throw error;
    const recovered = await findByOutputIdentity(task, identity);
    if (!recovered) throw error;
    return recovered;
  }
}

export const CreativeAssetGraphRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async get(id) {
    return Repository.getById(id);
  },

  async create(input = {}) {
    return Repository.create(createCreativeAssetNode(input));
  },

  createFromStoredProductionOutput,

  async createFromProductionTask({ task, output = {} }) {
    if (!task?.organization_id) {
      throw new Error("Production task organization_id required");
    }
    if (!task?.creative_project_id) {
      throw new Error("Production task creative_project_id required");
    }

    const normalized = unwrapOutput(output);
    if (normalized.storage_path && normalized.checksum) {
      return createFromStoredProductionOutput({
        task,
        output,
        stored: {
          storage_path: normalized.storage_path,
          checksum: normalized.checksum,
          byte_size: normalized.byte_size || null,
          content_type:
            normalized.content_type ||
            normalized.mime_type ||
            normalized.technical?.mime_type ||
            null,
          delivery_mode:
            normalized.delivery_mode || "PRIVATE_SIGNED_URL",
        },
      });
    }

    const url = resolveUrl(normalized);
    if (!url) {
      throw new Error("Completed production task has no media evidence");
    }

    const stored = await CreativeStorageRuntime.uploadFromUrl({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
      asset_id: task.id,
      url,
      filename:
        normalized.file_name || normalized.name || "provider-output.bin",
    });

    return createFromStoredProductionOutput({ task, output, stored });
  },

  async findReusable(input = {}) {
    return Repository.findReusable(input);
  },

  async approveForReuse(id, approvedBy = null) {
    return Repository.update(id, {
      status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
      reuse: { approved_for_reuse: true, reusable: true },
      review: {
        ai_reviewed: true,
        human_reviewed: true,
        approved: true,
        approved_by: approvedBy,
      },
    });
  },
};
