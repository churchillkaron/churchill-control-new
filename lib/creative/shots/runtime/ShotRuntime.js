import "@/lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap";

import { createShot } from "../documents/Shot";
import * as Repository from "../repositories/ShotRepository";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  creativeVideoQualityFromProject,
  resolveCreativeVideoExecutionQuality,
} from "@/lib/creative/video/runtime/CreativeVideoQualityPreferenceRuntime";
import {
  resolveCreativeVideoProviderConfiguration,
} from "@/lib/creative/video/runtime/CreativeVideoProviderConfigurationRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function shotServiceIdentity(value = {}) {
  const generation = object(value.generation);
  return {
    service_id: text(
      generation.service ||
      value.service_id ||
      value.service_code,
    ),
    capability: text(
      generation.capability ||
      value.capability,
    ),
    provider: text(
      generation.provider ||
      value.provider_id ||
      value.provider,
    ),
  };
}

function configuredShot(value = {}, configuration = {}) {
  const identity = shotServiceIdentity(value);
  return Boolean(
    (identity.capability && identity.capability === text(configuration.capability)) ||
    (identity.service_id && identity.service_id === text(configuration.service_id)) ||
    (identity.provider && identity.provider === text(configuration.provider)),
  );
}

function aspectRatio(value = {}, profile = {}) {
  const output = object(value.output_spec);
  const params = object(value.provider_parameters);
  return text(
    output.aspect_ratio ||
    output.aspectRatio ||
    params.aspect_ratio ||
    params.aspectRatio ||
    profile.default_aspect_ratio ||
    profile.supported_aspect_ratios?.[0],
  ) || null;
}

function durationSeconds(value = {}) {
  const output = object(value.output_spec);
  const generation = object(value.generation);
  const generationOutput = object(generation.output_spec);
  const duration = Number(
    value.duration_seconds ??
    output.duration_seconds ??
    generation.duration_seconds ??
    generation.estimated_seconds ??
    generationOutput.duration_seconds,
  );
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

async function applyProjectVideoQuality(value = {}) {
  if (!value.creative_project_id) return value;

  const project = await CreativeProjectRuntime.get(value.creative_project_id);
  if (!project) return value;

  const configuration = await resolveCreativeVideoProviderConfiguration({
    organization_id: project.organization_id,
    currency:
      project.metadata?.currency ||
      project.metadata?.budget_profile?.currency ||
      project.budget_profile?.currency ||
      null,
    preferred_provider:
      project.metadata?.video_provider_preference ||
      project.metadata?.generation_provider_preference ||
      null,
  });
  if (!configuredShot(value, configuration)) return value;

  const profile = configuration.video_capabilities;
  const preference = creativeVideoQualityFromProject(project);
  const ratio = aspectRatio(value, profile);
  const resolved = resolveCreativeVideoExecutionQuality({
    project,
    requested_quality: preference,
    provider: configuration.provider,
    model: configuration.model,
    duration_seconds: durationSeconds(value),
    aspect_ratio: ratio,
    provider_capabilities: profile,
  });

  if (!resolved.ready || !resolved.resolution) {
    return {
      ...value,
      metadata: {
        ...object(value.metadata),
        video_quality_preference: preference,
        video_quality_resolution_pending_preflight: true,
        video_quality_preflight_reasons: resolved.reasons,
        video_quality_provider_configuration: {
          contract: profile?.contract || null,
          provider: configuration.provider || null,
          model: configuration.model || null,
          pricing_id: configuration.pricing_id || null,
          service_id: configuration.service_id || null,
          capability: configuration.capability || null,
        },
      },
    };
  }

  return {
    ...value,
    output_spec: {
      ...object(value.output_spec),
      provider_resolution: resolved.resolution,
      quality_preference: preference,
      provider_native_frame_rate: resolved.provider_native_frame_rate,
      native_audio: resolved.native_audio,
      ...(resolved.dimensions || {}),
    },
    provider_parameters: {
      ...object(value.provider_parameters),
      resolution: resolved.resolution,
    },
    generation: {
      ...object(value.generation),
      provider: configuration.provider,
      model: configuration.model,
      output_spec: {
        ...object(value.generation?.output_spec),
        provider_resolution: resolved.resolution,
        quality_preference: preference,
        provider_native_frame_rate: resolved.provider_native_frame_rate,
        native_audio: resolved.native_audio,
        ...(resolved.dimensions || {}),
      },
      provider_parameters: {
        ...object(value.generation?.provider_parameters),
        resolution: resolved.resolution,
      },
    },
    metadata: {
      ...object(value.metadata),
      video_quality_preference: preference,
      video_quality_resolution: resolved.resolution,
      video_quality_resolution_pending_preflight: false,
      video_quality_preflight_reasons: [],
      video_quality_selection_contract: project.metadata?.video_quality_selection_contract || null,
      video_quality_provider_configuration: {
        contract: profile?.contract || null,
        provider: configuration.provider || null,
        model: configuration.model || null,
        pricing_id: configuration.pricing_id || null,
        service_id: configuration.service_id || null,
        capability: configuration.capability || null,
      },
    },
  };
}

function qualityPersistenceValues(values = {}, prepared = {}) {
  return {
    ...values,
    ...(prepared.output_spec
      ? { output_spec: prepared.output_spec }
      : {}),
    ...(prepared.provider_parameters
      ? { provider_parameters: prepared.provider_parameters }
      : {}),
    ...(prepared.generation
      ? { generation: prepared.generation }
      : {}),
    ...(prepared.metadata
      ? { metadata: prepared.metadata }
      : {}),
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
    return Repository.update(
      id,
      qualityPersistenceValues(values, prepared),
    );
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
  contract: "CREATIVE_SHOT_VIDEO_QUALITY_BINDING_V2",
  applyProjectVideoQuality,
});
