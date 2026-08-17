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
import {
  CreativeQualityPolicyResolverRuntime,
} from "@/lib/creative/quality/runtime/CreativeQualityPolicyResolverRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sourceContext(mission = {}) {
  const metadata = mission.metadata || {};
  return {
    source_type: metadata.source_type || metadata.source || "creative_studio",
    source_reference: metadata.source_reference || null,
    source_document_type: metadata.source_document_type || null,
    source_document_id: metadata.source_document_id || mission.campaign_id || null,
  };
}

function projectInput(mission = {}) {
  const metadata = mission.metadata || {};
  const configuredExportProfiles = Array.isArray(metadata.export_profiles)
    ? metadata.export_profiles.filter(Boolean)
    : [];

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
      ? metadata.target_languages.filter(Boolean)
      : [],
    target_duration: finite(metadata.target_duration),
    quality_profile: metadata.quality_profile || null,
    budget_profile: metadata.budget_profile || null,
    metadata: {
      ...metadata,
      ...sourceContext(mission),
      export_profiles: configuredExportProfiles,
      default_export_profile_id: metadata.default_export_profile_id || null,
      source: metadata.source || "creative_mission_start",
      creative_solution_source:
        metadata.creative_solution_source || "DIRECTOR_RESOLVED_FROM_CONTEXT",
    },
  };
}

function briefInput(mission = {}, project = {}) {
  const metadata = mission.metadata || {};

  return {
    organization_id: mission.organization_id,
    campaign_id: mission.campaign_id || null,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    title: mission.title || mission.business_goal || "Creative brief",
    business_goal: mission.business_goal || mission.objective || "",
    creative_objective: mission.objective || mission.business_goal || "",
    desired_outcome: metadata.desired_outcome || "",
    communication_goal: metadata.communication_goal || "",
    target_audience: mission.audience || {},
    context: {
      ...(metadata.context || {}),
      creative_source: sourceContext(mission),
    },
    products: Array.isArray(metadata.products) ? metadata.products : [],
    markets: Array.isArray(metadata.markets) ? metadata.markets : [],
    languages: Array.isArray(metadata.target_languages)
      ? metadata.target_languages.filter(Boolean)
      : [],
    channels: Array.isArray(mission.channels) ? mission.channels : [],
    duration_seconds: finite(metadata.target_duration),
    tone: metadata.tone || "",
    emotion: metadata.emotion || "",
    requested_action: metadata.call_to_action || "",
    budget: {
      max_cost:
        Number.isFinite(Number(metadata.budget_ceiling)) &&
        Number(metadata.budget_ceiling) >= 0
          ? Number(metadata.budget_ceiling)
          : 0,
      approved: false,
    },
    metadata: {
      source: metadata.source || "creative_mission_start",
      ...sourceContext(mission),
      mission_metadata: metadata,
      creative_solution_source:
        metadata.creative_solution_source || "DIRECTOR_RESOLVED_FROM_CONTEXT",
      media_default_injected: false,
      channel_default_injected: false,
      language_default_injected: false,
      duration_default_injected: false,
      tone_default_injected: false,
      emotion_default_injected: false,
    },
  };
}

function sameJson(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

async function ensureQualityPolicies(mission, project) {
  const resolved = CreativeQualityPolicyResolverRuntime.resolve({
    mission,
    project,
  });
  const currentMetadata = project.metadata || {};
  const unchanged =
    project.quality_profile === resolved.profile_id &&
    sameJson(
      currentMetadata.creative_quality_policy,
      resolved.creative_quality_policy,
    ) &&
    sameJson(
      currentMetadata.semantic_quality_policy,
      resolved.semantic_quality_policy,
    ) &&
    currentMetadata.quality_policy_resolver_version === resolved.resolver_version;

  if (unchanged) return project;

  return CreativeProjectRuntime.update(project.id, {
    quality_profile: resolved.profile_id,
    metadata: {
      ...currentMetadata,
      creative_quality_policy: resolved.creative_quality_policy,
      semantic_quality_policy: resolved.semantic_quality_policy,
      creative_quality_policy_source: resolved.creative_policy_source,
      semantic_quality_policy_source: resolved.semantic_policy_source,
      creative_quality_profile_id: resolved.profile_id,
      creative_quality_context: resolved.context,
      quality_policy_resolver_version: resolved.resolver_version,
      quality_policy_resolved_at: new Date().toISOString(),
    },
  });
}

async function ensureProject(mission) {
  const existing = await CreativeProjectRepository.getByMission({
    organization_id: mission.organization_id,
    creative_mission_id: mission.id,
  });
  const project = existing || await CreativeProjectRuntime.create(projectInput(mission));
  return ensureQualityPolicies(mission, project);
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
