import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeTemporalAnalysisRuntime,
} from "@/lib/creative/media/runtime/CreativeTemporalAnalysisRuntime";
import {
  CreativeMomentIntelligenceRuntime,
} from "@/lib/creative/media/runtime/CreativeMomentIntelligenceRuntime";
import {
  CreativeTimelineRuntime,
} from "@/lib/creative/timeline/runtime/CreativeTimelineRuntime";
import {
  CreativeExportProfileResolver,
} from "@/lib/creative/post-production/runtime/CreativeExportProfileResolver";
import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import {
  CreativePerceptualQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativePerceptualQualityRuntime";
import {
  CreativeRenderRepairRuntime,
} from "@/lib/creative/quality/runtime/CreativeRenderRepairRuntime";
import {
  CreativeRenderRepairExecutionRuntime,
} from "@/lib/creative/quality/runtime/CreativeRenderRepairExecutionRuntime";
import {
  CreativeReleaseGateRuntime,
} from "@/lib/creative/quality/runtime/CreativeReleaseGateRuntime";
import {
  CreativeReleaseReadinessRuntime,
} from "@/lib/creative/release/runtime/CreativeReleaseReadinessRuntime";
import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function newest(nodes = [], predicate = () => true) {
  return nodes
    .filter(predicate)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
}

function isSourceVideo(node = {}) {
  return (
    node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
    node.metadata?.virtual_clip !== true &&
    node.lineage?.source !== "scene_detection"
  );
}

function hasAudioEvidence(node = {}) {
  if (node.technical?.audio_codec) return true;
  return list(node.technical?.streams)
    .some((stream) => stream.codec_type === "audio");
}

function requirementFromShot(shot = {}) {
  return {
    shot_id: shot.id,
    scene_id: shot.scene_id || null,
    subject: shot.subject || shot.description || shot.purpose || "",
    action: shot.action || shot.intent?.action || "",
    purpose: shot.purpose || shot.intent?.purpose || "",
    emotion: shot.emotion || shot.intent?.emotion || "",
    mood: shot.mood || shot.intent?.mood || "",
    location: shot.location || shot.intent?.location || "",
    actors: list(shot.actors || shot.intent?.actors),
    products: list(shot.products || shot.intent?.products),
    dialogue: shot.dialogue || "",
    narration: shot.narration || "",
    brand_rules: shot.brand_rules || shot.intent?.brand_rules || {},
    tags: list(shot.tags || shot.metadata?.tags),
    transition_in: shot.transition_in || null,
    transition_out: shot.transition_out || null,
  };
}

function requirementFromTask(task = {}) {
  const intent = task.input?.intent || {};
  const requirements = task.input?.requirements || {};
  return {
    task_id: task.id,
    scene_id: task.scene_id || null,
    shot_id: task.shot_id || null,
    subject: requirements.subject || intent.subject || task.title || "",
    action: requirements.action || intent.action || "",
    purpose: requirements.purpose || intent.purpose || task.description || "",
    emotion: requirements.emotion || intent.emotion || "",
    mood: requirements.mood || intent.mood || "",
    location: requirements.location || intent.location || "",
    actors: list(requirements.actors || intent.actors),
    products: list(requirements.products || intent.products),
    dialogue: requirements.dialogue || intent.dialogue || "",
    narration: requirements.narration || intent.narration || "",
    brand_rules: requirements.brand_rules || intent.brand_rules || {},
    tags: list(requirements.tags || intent.tags),
  };
}

async function resolveRequirements({ organization_id, creative_project_id, tasks }) {
  const shots = await ShotRuntime.list({
    organization_id,
    creative_project_id,
  });
  const fromShots = shots.map(requirementFromShot);
  if (fromShots.length) return fromShots;
  return tasks
    .filter((task) => task.type === "GENERATE_VIDEO")
    .map(requirementFromTask);
}

function mediaPolicy(project = {}) {
  const configured = project.metadata?.post_production || {};
  return {
    temporal: {
      threshold: finite(
        configured.temporal_analysis?.threshold ??
        configured.temporalAnalysis?.threshold,
        0.3,
      ),
      minimum_scene_seconds: finite(
        configured.temporal_analysis?.minimum_scene_seconds ??
        configured.temporalAnalysis?.minimumSceneSeconds,
        0.75,
      ),
      ...(configured.temporal_analysis || configured.temporalAnalysis || {}),
    },
    moment: {
      weights: {
        semantic: 4,
        quality: 2,
        brand: 2,
        cut_strength: 1,
        transcript_evidence: 1,
        ...(configured.moment_intelligence?.weights ||
          configured.momentIntelligence?.weights || {}),
      },
      ...(configured.moment_intelligence || configured.momentIntelligence || {}),
    },
    timeline: {
      minimum_score: finite(
        configured.timeline?.minimum_score ??
        configured.timeline?.minimumScore,
        0,
      ),
      maximum_duration_seconds: finite(
        configured.timeline?.maximum_duration_seconds ??
        configured.timeline?.maximumDurationSeconds ??
        project.target_duration,
        null,
      ),
      allow_fallback: configured.timeline?.allow_fallback !== false,
      ...(configured.timeline || {}),
    },
    render: configured.render || {},
    quality: project.metadata?.quality_gate || configured.quality || {},
    repair: configured.repair || project.metadata?.repair || {},
    releaseGate:
      project.metadata?.release_gate ||
      project.metadata?.rights_policy ||
      {},
  };
}

function automaticTracks(nodes = [], timeline = {}) {
  const duration = finite(timeline.technical?.duration_seconds, null);
  const audio = nodes
    .filter((node) => [
      CREATIVE_ASSET_NODE_TYPES.AUDIO,
      CREATIVE_ASSET_NODE_TYPES.VOICE,
      CREATIVE_ASSET_NODE_TYPES.MUSIC,
      CREATIVE_ASSET_NODE_TYPES.SFX,
    ].includes(node.type))
    .filter((node) => node.url && node.metadata?.include_in_master !== false)
    .map((node) => ({
      asset_node_id: node.id,
      timeline_in_seconds: finite(node.metadata?.timeline_in_seconds, 0),
      source_in_seconds: finite(node.metadata?.source_in_seconds, 0),
      duration_seconds: finite(node.metadata?.duration_seconds, duration),
      gain: finite(
        node.metadata?.gain,
        node.type === CREATIVE_ASSET_NODE_TYPES.MUSIC ? 0.35 : 1,
      ),
      role: node.metadata?.render_role || node.type,
    }));

  const overlays = nodes
    .filter((node) => node.url)
    .filter((node) =>
      node.metadata?.render_role === "OVERLAY" ||
      node.metadata?.include_as_overlay === true,
    )
    .map((node) => ({
      asset_node_id: node.id,
      timeline_in_seconds: finite(node.metadata?.timeline_in_seconds, 0),
      duration_seconds: finite(node.metadata?.duration_seconds, duration),
      x: node.metadata?.x ?? 0,
      y: node.metadata?.y ?? 0,
      width: finite(node.metadata?.width, null),
      height: finite(node.metadata?.height, null),
      opacity: finite(node.metadata?.opacity, 1),
    }));

  const subtitle = newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.SUBTITLE &&
    Boolean(node.url),
  );

  return {
    audio,
    overlays,
    subtitle_asset_node_id: subtitle?.id || null,
    asset_node_ids: [
      ...audio.map((track) => track.asset_node_id),
      ...overlays.map((track) => track.asset_node_id),
      subtitle?.id,
    ].filter(Boolean),
  };
}

async function prepareMoments({
  organization_id,
  creative_project_id,
  requirements,
  project,
  policy,
}) {
  const nodes = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });
  const videos = nodes.filter(isSourceVideo);
  if (!videos.length) {
    return {
      status: "AWAITING_VIDEO_ASSETS",
      videos: [],
      clips: [],
      moments: [],
    };
  }

  const clips = [];
  const moments = [];
  for (const video of videos) {
    const temporal = await CreativeTemporalAnalysisRuntime.analyze({
      organization_id,
      parent_asset_node_id: video.id,
      options: policy.temporal,
      policy: policy.render,
    });
    clips.push(...list(temporal.scenes));

    const intelligence = await CreativeMomentIntelligenceRuntime.analyze({
      organization_id,
      parent_asset_node_id: video.id,
      requirements,
      policy: policy.moment,
    });
    moments.push(...list(intelligence.moments));
  }

  return {
    status: moments.length ? "READY" : "AWAITING_SEMANTIC_MOMENTS",
    videos,
    clips,
    moments,
    project,
  };
}

async function maybeRepair({
  organization_id,
  renderResult,
  policy,
}) {
  if (renderResult.technical_qc?.passed !== false) {
    return {
      render: renderResult.render,
      technical_qc: renderResult.technical_qc,
      repair_plan: null,
      repair_execution: null,
    };
  }

  const planned = await CreativeRenderRepairRuntime.plan({
    organization_id,
    render_asset_node_id: renderResult.render.id,
  });
  const allowAutomatic = policy.allow_automatic_repair === true ||
    policy.allowAutomaticRepair === true;
  const maxAttempts = finite(
    policy.max_repair_attempts ?? policy.maxRepairAttempts,
    2,
  );

  if (!allowAutomatic || planned.plan.metadata?.fully_automatic !== true) {
    return {
      render: renderResult.render,
      technical_qc: renderResult.technical_qc,
      repair_plan: planned.plan,
      repair_execution: null,
    };
  }

  const executed = await CreativeRenderRepairExecutionRuntime.execute({
    organization_id,
    repair_plan_asset_node_id: planned.plan.id,
    policy: {
      ...policy,
      allow_automatic_repair: true,
      max_repair_attempts: maxAttempts,
    },
  });

  return {
    render: executed.render,
    technical_qc: executed.execution?.metadata?.technical_qc || null,
    repair_plan: planned.plan,
    repair_execution: executed.execution,
  };
}

export const CreativePostProductionRuntime = {
  async run({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const project = await CreativeProjectRepository.getById(creative_project_id);
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }

    const tasks = await ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
    });
    const failed = tasks.filter((task) => ["FAILED", "SKIPPED"].includes(task.status));
    const incomplete = tasks.filter((task) => task.status !== "COMPLETED");

    if (failed.length) {
      return {
        status: "BLOCKED_BY_PRODUCTION_FAILURE",
        failed_task_ids: failed.map((task) => task.id),
      };
    }
    if (!tasks.length || incomplete.length) {
      return {
        status: "AWAITING_PRODUCTION",
        incomplete_task_ids: incomplete.map((task) => task.id),
      };
    }

    const stateInput = {
      organization_id,
      creative_project_id,
      creative_mission_id: project.creative_mission_id,
    };
    const policy = mediaPolicy(project);
    const requirements = await resolveRequirements({
      organization_id,
      creative_project_id,
      tasks,
    });
    const prepared = await prepareMoments({
      organization_id,
      creative_project_id,
      requirements,
      project,
      policy,
    });

    if (prepared.status !== "READY") {
      return prepared;
    }

    await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.RENDERING);
    const composed = await CreativeTimelineRuntime.compose({
      organization_id,
      creative_project_id,
      requirements,
      options: policy.timeline,
    });
    const allNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const tracks = automaticTracks(allNodes, composed.timeline);

    const releaseGate = await CreativeReleaseGateRuntime.evaluate({
      organization_id,
      timeline_asset_node_id: composed.timeline.id,
      asset_node_ids: tracks.asset_node_ids,
      policy: policy.releaseGate,
    });
    const configuredGate = project.metadata?.release_gate || {};
    if (
      configuredGate.require_before_render === true &&
      releaseGate.report.metadata?.passed !== true
    ) {
      await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.REVIEWING);
      return {
        status: "BLOCKED_BY_RELEASE_GATE",
        timeline: composed.timeline,
        release_gate: releaseGate.report,
      };
    }

    const resolvedProfile = await CreativeExportProfileResolver.resolve({
      organization_id,
      timeline_asset_node_id: composed.timeline.id,
      channel: project.target_channels?.[0] || null,
    });
    const sourceNodes = composed.timeline.metadata?.edit_decision_list
      .map((edit) => allNodes.find((node) =>
        node.id === edit.source_asset_node_id ||
        node.id === edit.source_clip_node_id,
      ))
      .filter(Boolean);
    const everySourceHasAudio = sourceNodes.length > 0 &&
      sourceNodes.every(hasAudioEvidence);
    const exportProfile = {
      ...resolvedProfile.profile,
      include_source_audio:
        resolvedProfile.profile.include_source_audio ??
        everySourceHasAudio,
    };

    const renderResult = await CreativeEdlRenderRuntime.render({
      organization_id,
      timeline_asset_node_id: composed.timeline.id,
      export_profile: exportProfile,
      tracks,
      policy: policy.render,
    });
    const repaired = await maybeRepair({
      organization_id,
      renderResult,
      policy: {
        ...policy.render,
        ...policy.repair,
      },
    });

    let perceptual = null;
    const perceptualPolicy = policy.quality.perceptual_policy ||
      policy.quality.perceptualPolicy ||
      {};
    if (
      policy.quality.require_perceptual_qc === true ||
      Object.keys(perceptualPolicy).length
    ) {
      perceptual = await CreativePerceptualQualityRuntime.analyze({
        organization_id,
        render_asset_node_id: repaired.render.id,
        policy: {
          ...policy.render,
          ...perceptualPolicy,
        },
      });
    }

    await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.REVIEWING);
    const readiness = await CreativeReleaseReadinessRuntime.evaluate({
      organization_id,
      creative_project_id,
      timeline_asset_node_id: composed.timeline.id,
      final_render_asset_node_id: repaired.render.id,
    });

    return {
      status: readiness.report.metadata?.passed
        ? "READY_FOR_APPROVAL"
        : "REVIEW_REQUIRED",
      requirements,
      videos: prepared.videos,
      clips: prepared.clips,
      moments: prepared.moments,
      timeline: composed.timeline,
      tracks,
      export_profile: exportProfile,
      export_profile_source: resolvedProfile.source,
      release_gate: releaseGate.report,
      render: repaired.render,
      technical_qc: repaired.technical_qc,
      perceptual_quality: perceptual?.report || null,
      repair_plan: repaired.repair_plan,
      repair_execution: repaired.repair_execution,
      release_readiness: readiness.report,
    };
  },
};
