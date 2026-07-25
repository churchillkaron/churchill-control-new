import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
} from "../documents/CreativeAssetNode";

import * as Repository from "../repositories/CreativeAssetGraphRepository";

import {
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

function first(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function unwrapOutput(output = {}) {
  let current = output;
  const seen = new Set();

  while (
    current &&
    typeof current === "object" &&
    current.output &&
    typeof current.output === "object" &&
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

async function inspectGeneratedMedia({ task, normalized, url }) {
  try {
    return await CreativeMediaInspectionRuntime.inspect({
      url,
      file_name: normalized.file_name || normalized.name || null,
      mime_type:
        normalized.technical?.mime_type ||
        normalized.mime_type ||
        null,
      policy:
        task.input?.inspection_policy ||
        task.metadata?.inspection_policy ||
        {},
    });
  } catch (error) {
    return {
      status: "PARTIAL",
      reason: error?.message || String(error),
      technical: {},
    };
  }
}

export const CreativeAssetGraphRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async create(input = {}) {
    const node = createCreativeAssetNode(input);
    return Repository.create(node);
  },

  async createFromProductionTask({ task, output = {} }) {
    if (!task?.organization_id) {
      throw new Error("Production task organization_id required");
    }

    const normalized = unwrapOutput(output);
    const url = resolveUrl(normalized);
    if (!url) {
      throw new Error("Completed production task has no media URL");
    }

    const inspection = await inspectGeneratedMedia({
      task,
      normalized,
      url,
    });
    const technical = {
      ...(inspection.technical || {}),
      ...(normalized.technical || {}),
      mime_type: first(
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
      checksum: first(
        normalized.technical?.checksum,
        normalized.checksum,
        inspection.technical?.checksum_sha256,
      ),
    };

    return this.create({
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
      url,
      storage_path: normalized.storage_path || null,
      lineage: {
        source: "production_task",
        provider_id:
          normalized.provider_id ||
          output.provider ||
          task.provider_id ||
          null,
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
          0,
        ),
        brand_match_score: first(
          normalized.intelligence?.brand_match_score,
          normalized.brand_match_score,
          0,
        ),
        reuse_score: first(
          normalized.intelligence?.reuse_score,
          normalized.reuse_score,
          0,
        ),
        safety_status: first(
          normalized.intelligence?.safety_status,
          normalized.safety_status,
          "UNKNOWN",
        ),
        tags: first(
          normalized.intelligence?.tags,
          normalized.tags,
          [],
        ),
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
        currency: first(
          output.pricing?.currency,
          output.usage?.currency,
          task.cost?.currency,
          null,
        ),
        estimated: Number(task.cost?.estimated || 0),
        actual: Number(
          output.pricing?.customer_price ??
          task.cost?.actual ??
          0,
        ),
        saved_by_reuse: 0,
      },
      reuse: {
        reusable: false,
        approved_for_reuse: false,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
      },
      metadata: {
        task_type: task.type,
        task_output: output,
        requirements: task.input?.requirements || null,
        restrictions:
          normalized.restrictions ||
          task.input?.restrictions ||
          {},
        inspection_status: inspection.status,
        inspection_reason: inspection.reason,
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
