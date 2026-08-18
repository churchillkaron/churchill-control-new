import "@/lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap";

import { createShot } from "../documents/Shot";
import * as Repository from "../repositories/ShotRepository";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  creativeVideoQualityDimensions,
  creativeVideoQualityFromProject,
  creativeVideoQualityDefinition,
} from "@/lib/creative/video/runtime/CreativeVideoQualityPreferenceRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function videoShot(value = {}) {
  const generation = object(value.generation);
  const capability = text(
    generation.capability ||
    generation.service ||
    value.capability ||
    value.service_id,
  ).toLowerCase();
  return capability.includes("video");
}

function aspectRatio(value = {}) {
  const output = object(value.output_spec);
  const params = object(value.provider_parameters);
  return text(
    output.aspect_ratio ||
    output.aspectRatio ||
    params.aspect_ratio ||
    params.aspectRatio,
  ) || "16:9";
}

async function applyProjectVideoQuality(value = {}) {
  if (!videoShot(value) || !value.creative_project_id) return value;

  const project = await CreativeProjectRuntime.get(value.creative_project_id);
  if (!project) return value;

  const preference = creativeVideoQualityFromProject(project);
  const definition = creativeVideoQualityDefinition(preference);
  if (!definition.resolution) {
    return {
      ...value,
      metadata: {
        ...object(value.metadata),
        video_quality_preference: preference,
        video_quality_resolution_pending_preflight: true,
      },
    };
  }

  const ratio = aspectRatio(value);
  const dimensions = creativeVideoQualityDimensions({
    quality: preference,
    aspect_ratio: ratio,
  });

  return {
    ...value,
    output_spec: {
      ...object(value.output_spec),
      provider_resolution: definition.resolution,
      quality_preference: preference,
      ...(dimensions
        ? {
            width: dimensions.width,
            height: dimensions.height,
          }
        : {}),
    },
    provider_parameters: {
      ...object(value.provider_parameters),
      resolution: definition.resolution,
    },
    generation: {
      ...object(value.generation),
      output_spec: {
        ...object(value.generation?.output_spec),
        provider_resolution: definition.resolution,
        quality_preference: preference,
        ...(dimensions
          ? {
              width: dimensions.width,
              height: dimensions.height,
            }
          : {}),
      },
      provider_parameters: {
        ...object(value.generation?.provider_parameters),
        resolution: definition.resolution,
      },
    },
    metadata: {
      ...object(value.metadata),
      video_quality_preference: preference,
      video_quality_resolution: definition.resolution,
      video_quality_resolution_pending_preflight: false,
      video_quality_selection_contract: project.metadata?.video_quality_selection_contract || null,
    },
  };
}

export const ShotRuntime = {
  async list(input = {}) {
    return Repository.list(input);
  },

  async get(id) {
    return Repository.get(id);
  },

  async create(input = {}) {
    const prepared = await applyProjectVideoQuality(input);
    return Repository.create(createShot(prepared));
  },

  async update(id, values = {}) {
    const current = await Repository.get(id);
    if (!current) return Repository.update(id, values);
    const prepared = await applyProjectVideoQuality({
      ...current,
      ...values,
      output_spec: {
        ...object(current.output_spec),
        ...object(values.output_spec),
      },
      provider_parameters: {
        ...object(current.provider_parameters),
        ...object(values.provider_parameters),
      },
      generation: {
        ...object(current.generation),
        ...object(values.generation),
        output_spec: {
          ...object(current.generation?.output_spec),
          ...object(values.generation?.output_spec),
        },
        provider_parameters: {
          ...object(current.generation?.provider_parameters),
          ...object(values.generation?.provider_parameters),
        },
      },
      metadata: {
        ...object(current.metadata),
        ...object(values.metadata),
      },
    });
    return Repository.update(id, prepared);
  },

  async byScene(input = {}) {
    const shots = await Repository.list(input);
    return shots.reduce((map, shot) => {
      if (!map[shot.scene_id]) map[shot.scene_id] = [];
      map[shot.scene_id].push(shot);
      return map;
    }, {});
  },

  async archive(id) {
    return Repository.update(id, {
      archived_at: new Date().toISOString(),
    });
  },

  async resolve(input = {}, permissions = []) {
    const items = await this.list(input);
    const current = items[0] || null;
    return {
      current,
      items,
      commands: ["create", "update", "archive"],
      status: current?.status || "ready",
      permissions,
    };
  },
};

export const CreativeShotVideoQualityBindingRuntime = Object.freeze({
  contract: "CREATIVE_SHOT_VIDEO_QUALITY_BINDING_V1",
  applyProjectVideoQuality,
});
