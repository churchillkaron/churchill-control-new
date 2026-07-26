import {
  createCreativeMissionDocument,
} from "../documents/CreativeMission";
import {
  CreativeMissionRepository,
} from "../repositories/CreativeMissionRepository";
import {
  CreativeStateEngine,
} from "@/lib/creative/state/CreativeStateEngine";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  CreativeBriefRuntime,
} from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function defaultExportProfiles() {
  return [
    {
      id: "master-landscape-h264",
      name: "Master landscape",
      default: true,
      channels: ["website", "youtube", "presentation", "cinema", "display"],
      extension: "mp4",
      container: "mp4",
      mime_type: "video/mp4",
      video_codec: "libx264",
      pixel_format: "yuv420p",
      width: 1920,
      height: 1080,
      frame_rate: 30,
      video_bitrate: "12M",
      audio_codec: "aac",
      audio_bitrate: "320k",
      audio_channels: 2,
      sample_rate: 48000,
      audio_channel_layout: "stereo",
      subtitle_mode: "burn",
      include_source_audio: false,
      fit: "cover",
      audio_mix_normalize: false,
      version: 1,
    },
    {
      id: "master-vertical-h264",
      name: "Master vertical",
      channels: ["instagram", "facebook", "tiktok", "shorts", "reels", "story"],
      extension: "mp4",
      container: "mp4",
      mime_type: "video/mp4",
      video_codec: "libx264",
      pixel_format: "yuv420p",
      width: 1080,
      height: 1920,
      frame_rate: 30,
      video_bitrate: "12M",
      audio_codec: "aac",
      audio_bitrate: "320k",
      audio_channels: 2,
      sample_rate: 48000,
      audio_channel_layout: "stereo",
      subtitle_mode: "burn",
      include_source_audio: false,
      fit: "cover",
      audio_mix_normalize: false,
      version: 1,
    },
    {
      id: "master-square-h264",
      name: "Master square",
      channels: ["feed", "square", "marketplace"],
      extension: "mp4",
      container: "mp4",
      mime_type: "video/mp4",
      video_codec: "libx264",
      pixel_format: "yuv420p",
      width: 1080,
      height: 1080,
      frame_rate: 30,
      video_bitrate: "10M",
      audio_codec: "aac",
      audio_bitrate: "320k",
      audio_channels: 2,
      sample_rate: 48000,
      audio_channel_layout: "stereo",
      subtitle_mode: "burn",
      include_source_audio: false,
      fit: "cover",
      audio_mix_normalize: false,
      version: 1,
    },
  ];
}

function projectInput(mission = {}) {
  const metadata = mission.metadata || {};
  return {
    organization_id: mission.organization_id,
    creative_mission_id: mission.id,
    campaign_id: mission.campaign_id || null,
    name: mission.title || mission.business_goal || mission.objective || "Creative project",
    description: mission.objective || mission.business_goal || "",
    objective: mission.objective || mission.business_goal || "",
    production_type: metadata.production_type || null,
    target_channels: Array.isArray(mission.channels) ? mission.channels : [],
    target_languages: Array.isArray(metadata.target_languages)
      ? metadata.target_languages
      : [],
    target_duration: Number(metadata.target_duration || 30),
    quality_profile: metadata.quality_profile || null,
    budget_profile: metadata.budget_profile || null,
    metadata: {
      ...metadata,
      export_profiles: Array.isArray(metadata.export_profiles) && metadata.export_profiles.length
        ? metadata.export_profiles
        : defaultExportProfiles(),
      default_export_profile_id:
        metadata.default_export_profile_id || "master-landscape-h264",
      source: "creative_mission_start",
    },
  };
}

function briefInput(mission = {}, project = {}) {
  return {
    organization_id: mission.organization_id,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    title: mission.title || mission.business_goal || "Creative brief",
    business_goal: mission.business_goal || mission.objective || "",
    creative_objective: mission.objective || mission.business_goal || "",
    desired_outcome: mission.metadata?.desired_outcome || "",
    communication_goal: mission.metadata?.communication_goal || "",
    target_audience: mission.audience || {},
    context: mission.metadata?.context || {},
    products: Array.isArray(mission.metadata?.products) ? mission.metadata.products : [],
    markets: Array.isArray(mission.metadata?.markets) ? mission.metadata.markets : [],
    languages: Array.isArray(mission.metadata?.target_languages)
      ? mission.metadata.target_languages
      : ["en"],
    channels: Array.isArray(mission.channels) ? mission.channels : [],
    duration_seconds: Number(mission.metadata?.target_duration || 30),
    tone: mission.metadata?.tone || "professional",
    emotion: mission.metadata?.emotion || "trust",
    requested_action: mission.metadata?.call_to_action || "",
    metadata: {
      source: "creative_mission_start",
      mission_metadata: mission.metadata || {},
    },
  };
}

async function ensureProject(mission) {
  const existing = await CreativeProjectRepository.getByMission({
    organization_id: mission.organization_id,
    creative_mission_id: mission.id,
  });
  return existing || CreativeProjectRuntime.create(projectInput(mission));
}

async function ensureBrief(mission, project) {
  const existing = await CreativeBriefRuntime.list({
    organization_id: mission.organization_id,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
  });
  return existing[0] || CreativeBriefRuntime.create(briefInput(mission, project));
}

export const CreativeMissionRuntime = {
  async list({ organizationId, organization_id } = {}) {
    const resolvedOrganizationId = organizationId || organization_id;
    return CreativeMissionRepository.list({
      organization_id: resolvedOrganizationId,
    });
  },

  async get(id) {
    const { data, error } = await supabaseAdmin
      .from("creative_missions")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(payload = {}) {
    const mission = createCreativeMissionDocument(payload);
    return CreativeMissionRepository.create(mission);
  },

  async update(id, values = {}) {
    const { data, error } = await supabaseAdmin
      .from("creative_missions")
      .update({
        ...values,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async start(id) {
    const current = await CreativeMissionRuntime.get(id);
    const mission = current.status === "active"
      ? current
      : await CreativeMissionRuntime.update(id, {
          status: "active",
          started_at: current.started_at || new Date().toISOString(),
        });

    const project = await ensureProject(mission);
    const brief = await ensureBrief(mission, project);
    const state = await CreativeStateEngine.init({
      organization_id: mission.organization_id,
      creative_mission_id: mission.id,
      creative_project_id: project.id,
      campaign_id: mission.campaign_id || null,
      stage: CreativeStateEngine.stages.UNDERSTANDING,
    });

    return {
      ...mission,
      runtime_context: {
        creative_project_id: project.id,
        creative_brief_id: brief.id,
        creative_state_id: state.id || state.creative_mission_id,
      },
    };
  },

  async pause(id) {
    return CreativeMissionRuntime.update(id, { status: "paused" });
  },

  async complete(id, learning_summary = null) {
    return CreativeMissionRuntime.update(id, {
      status: "completed",
      learning_summary,
      completed_at: new Date().toISOString(),
    });
  },

  async archive(id) {
    return CreativeMissionRuntime.update(id, { status: "archived" });
  },
};
