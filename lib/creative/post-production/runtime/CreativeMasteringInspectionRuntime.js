import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  creativeStorageReference,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestamp(node = {}) {
  return Date.parse(node.updated_at || node.created_at || 0) || 0;
}

function newest(nodes = [], predicate = () => true) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) => timestamp(right) - timestamp(left))[0] || null;
}

function profileId(profile = {}) {
  return text(profile.id || profile.name);
}

function configuredProfiles(project = {}) {
  const metadata = project.metadata || {};
  const direct = [
    ...list(metadata.export_profiles),
    ...list(metadata.exportProfiles),
    ...list(metadata.delivery_profiles),
    ...list(metadata.deliveryProfiles),
    ...list(metadata.render_profiles),
    ...list(metadata.renderProfiles),
  ];
  const channels = [
    ...list(metadata.channel_export_profiles),
    ...list(metadata.channelExportProfiles),
  ].flatMap((entry) => list(
    entry?.profiles ||
    entry?.export_profiles ||
    entry?.exportProfiles,
  ));

  return [...direct, ...channels]
    .filter((profile) => profile && typeof profile === "object" && profileId(profile));
}

function renderProfileId(render = {}) {
  return profileId(render.metadata?.export_profile || {});
}

function compactApproval(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    scope: node.metadata?.scope || null,
    subject_asset_node_id: node.metadata?.subject_asset_node_id || null,
    approver_user_id: node.metadata?.approver_user_id || null,
    approver_staff_account_id: node.metadata?.approver_staff_account_id || null,
    approved_at: node.metadata?.approved_at || node.created_at || null,
    notes: node.review?.notes || node.metadata?.notes || "",
  };
}

function compactReport(node) {
  if (!node) return null;
  return {
    id: node.id,
    type: node.type,
    status: node.status,
    name: node.name || "",
    source: node.lineage?.source || null,
    passed: node.metadata?.passed === true,
    checks: list(node.metadata?.checks),
    failed_checks: list(node.metadata?.failed_checks),
    validation_failures: list(node.metadata?.validation_failures),
    evaluated_at:
      node.metadata?.evaluated_at ||
      node.metadata?.created_at ||
      node.updated_at ||
      node.created_at ||
      null,
    review: node.review || {},
  };
}

function compactTimeline(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    name: node.name || "Creative timeline",
    duration_seconds:
      finite(node.metadata?.total_duration_seconds) ??
      finite(node.technical?.duration_seconds),
    clip_count:
      finite(node.metadata?.clip_count) ??
      list(node.metadata?.edit_decision_list).length,
    distinct_source_count: finite(node.metadata?.distinct_source_count),
    format: node.metadata?.format || null,
    missing_requirements: list(node.metadata?.missing_requirements),
    performance_verified_only:
      node.metadata?.performance_verified_only === true,
    timeline_identity: node.metadata?.timeline_identity || null,
    review: node.review || {},
    created_at: node.created_at || null,
    updated_at: node.updated_at || null,
  };
}

async function previewUrl(organizationId, node) {
  if (!node?.url) return { url: null, error: null };
  if (!creativeStorageReference(node.url)) {
    return { url: node.url, error: null };
  }

  try {
    return {
      url: await signCreativeStorageReference({
        organization_id: organizationId,
        reference: node.url,
      }),
      error: null,
    };
  } catch (error) {
    return {
      url: null,
      error: error?.message || "MASTER_PREVIEW_SIGNING_FAILED",
    };
  }
}

function compactRender(node, preview = {}) {
  if (!node) return null;
  const metadata = node.metadata || {};
  const technical = node.technical || {};
  const technicalQc = metadata.technical_qc || null;
  const soundtrackRequired = Boolean(
    metadata.master_soundtrack_contract_hash ||
    metadata.master_soundtrack_asset_node_id,
  );
  const professionalFinishing = Boolean(
    metadata.professional_finishing_contract ||
    metadata.professional_master_audio_lock_contract,
  );
  const audioIntegrityRequired = soundtrackRequired && professionalFinishing;

  return {
    id: node.id,
    status: node.status,
    name: node.name || "Final render",
    preview_url: preview.url || null,
    preview_error: preview.error || null,
    storage_path: node.storage_path || null,
    technical: {
      mime_type: technical.mime_type || null,
      width: finite(technical.width),
      height: finite(technical.height),
      duration_seconds: finite(technical.duration_seconds),
      frame_rate:
        finite(technical.frame_rate) ??
        finite(technical.fps) ??
        finite(technical.video_frame_rate),
      video_codec: technical.video_codec || null,
      audio_codec: technical.audio_codec || null,
      sample_rate: finite(technical.sample_rate),
      audio_channels: finite(technical.audio_channels),
      audio_channel_layout: technical.audio_channel_layout || null,
      file_size_bytes: finite(technical.file_size_bytes),
      checksum: technical.checksum || null,
    },
    export_profile: metadata.export_profile || null,
    technical_qc: technicalQc,
    render_identity: metadata.render_identity || null,
    final_master_audio: {
      required: audioIntegrityRequired,
      soundtrack_present: soundtrackRequired,
      professional_finishing_present: professionalFinishing,
      soundtrack_asset_node_id:
        metadata.master_soundtrack_asset_node_id || null,
      integrity_passed:
        metadata.master_soundtrack_integrity_passed_after_finishing === true,
      verified: metadata.final_master_audio_verified === true,
      evidence:
        metadata.master_soundtrack_integrity_after_finishing || null,
    },
    review: node.review || {},
    created_at: node.created_at || null,
    updated_at: node.updated_at || null,
  };
}

function approvalFor(nodes, subjectId, scope) {
  if (!subjectId) return null;
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    node.parent_asset_node_id === subjectId &&
    node.metadata?.subject_asset_node_id === subjectId &&
    node.metadata?.scope === scope,
  );
}

function latestQualityReport(nodes, renderId, source) {
  if (!renderId) return null;
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
    node.parent_asset_node_id === renderId &&
    node.lineage?.source === source,
  );
}

function compactRepair(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    name: node.name || "Repair plan",
    fully_automatic: node.metadata?.fully_automatic === true,
    repair_execution_of: node.metadata?.repair_execution_of || null,
    technical_qc: node.metadata?.technical_qc || null,
    review: node.review || {},
    created_at: node.created_at || null,
    updated_at: node.updated_at || null,
  };
}

function audioTrack(node) {
  return {
    id: node.id,
    type: node.type,
    status: node.status,
    name: node.name || node.type,
    role: node.metadata?.render_role || node.type,
    timeline_in_seconds: finite(node.metadata?.timeline_in_seconds, 0),
    duration_seconds:
      finite(node.metadata?.duration_seconds) ??
      finite(node.technical?.duration_seconds),
    gain: finite(
      node.metadata?.gain,
      node.type === CREATIVE_ASSET_NODE_TYPES.MUSIC ? 0.35 : 1,
    ),
    audio_codec: node.technical?.audio_codec || null,
    sample_rate: finite(node.technical?.sample_rate),
  };
}

function profileSummary(profile = {}, render = null) {
  return {
    id: profileId(profile),
    name: profile.name || profile.id || "Delivery profile",
    channels: list(profile.channels || profile.target_channels || profile.targetChannels),
    width: finite(profile.width),
    height: finite(profile.height),
    frame_rate: finite(profile.frame_rate ?? profile.frameRate),
    video_codec: profile.video_codec || profile.videoCodec || null,
    video_bitrate: profile.video_bitrate || profile.videoBitrate || null,
    audio_codec: profile.audio_codec || profile.audioCodec || null,
    audio_bitrate: profile.audio_bitrate || profile.audioBitrate || null,
    sample_rate: finite(profile.sample_rate ?? profile.sampleRate),
    audio_channel_layout:
      profile.audio_channel_layout ||
      profile.audioChannelLayout ||
      null,
    subtitle_mode: profile.subtitle_mode || profile.subtitleMode || null,
    container: profile.container || profile.extension || null,
    default:
      profile.default === true ||
      profile.is_default === true ||
      profile.isDefault === true,
    render_id: render?.id || null,
    render_status: render?.status || null,
    rendered_at: render?.updated_at || render?.created_at || null,
  };
}

export const CreativeMasteringInspectionRuntime = {
  async inspect({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, tasks, nodes] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
      AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
    ]);

    if (!project || String(project.organization_id) !== String(organization_id)) {
      throw new Error("Creative project not found");
    }

    const timelines = nodes
      .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE)
      .sort((left, right) => timestamp(right) - timestamp(left));
    const timeline = timelines[0] || null;

    const renders = nodes
      .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER)
      .filter((node) =>
        !timeline ||
        node.parent_asset_node_id === timeline.id ||
        node.metadata?.timeline_asset_node_id === timeline.id,
      )
      .sort((left, right) => timestamp(right) - timestamp(left));
    const render = renders[0] || null;
    const preview = await previewUrl(organization_id, render);

    const perceptual = latestQualityReport(nodes, render?.id, "perceptual_qc");
    const semantic = latestQualityReport(nodes, render?.id, "semantic_quality_review");
    const releaseGate = timeline
      ? newest(nodes, (node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT &&
          node.parent_asset_node_id === timeline.id,
        )
      : null;
    const releaseReadiness = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
      (
        node.parent_asset_node_id === render?.id ||
        node.parent_asset_node_id === timeline?.id ||
        node.metadata?.final_render_asset_node_id === render?.id
      ),
    );
    const renderApproval = approvalFor(nodes, render?.id, "FINAL_RENDER");
    const releaseGateApproval = approvalFor(nodes, releaseGate?.id, "RELEASE_GATE");

    const repairPlans = render
      ? nodes
          .filter((node) =>
            node.type === CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN &&
            node.parent_asset_node_id === render.id,
          )
          .sort((left, right) => timestamp(right) - timestamp(left))
      : [];
    const repairPlan = repairPlans.find((node) => !node.metadata?.repair_execution_of) || null;
    const repairExecution = repairPlan
      ? repairPlans.find((node) =>
          node.metadata?.repair_execution_of === repairPlan.id,
        ) || null
      : null;

    const audioNodes = nodes
      .filter((node) => [
        CREATIVE_ASSET_NODE_TYPES.AUDIO,
        CREATIVE_ASSET_NODE_TYPES.VOICE,
        CREATIVE_ASSET_NODE_TYPES.MUSIC,
        CREATIVE_ASSET_NODE_TYPES.SFX,
      ].includes(node.type))
      .filter((node) => node.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED)
      .filter((node) => node.metadata?.blocked !== true)
      .map(audioTrack);
    const subtitleNodes = nodes
      .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.SUBTITLE)
      .filter((node) => node.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED)
      .map((node) => ({
        id: node.id,
        status: node.status,
        name: node.name || "Subtitle",
        format: node.technical?.mime_type || null,
      }));

    const profiles = configuredProfiles(project);
    const variantRenders = await Promise.all(profiles.map(async (profile) => {
      const matchingRender = renders.find((candidate) =>
        renderProfileId(candidate) === profileId(profile),
      ) || null;
      return {
        ...profileSummary(profile, matchingRender),
        preview_url:
          matchingRender
            ? (await previewUrl(organization_id, matchingRender)).url
            : null,
      };
    }));

    const failedTasks = tasks.filter((task) =>
      ["FAILED", "SKIPPED"].includes(String(task.status).toUpperCase()),
    );
    const runningTasks = tasks.filter((task) =>
      String(task.status).toUpperCase() === "RUNNING",
    );
    const reviewTasks = tasks.filter((task) =>
      String(task.status).toUpperCase() === "REVIEW",
    );
    const incompleteTasks = tasks.filter((task) =>
      String(task.status).toUpperCase() !== "COMPLETED",
    );

    const renderCompact = compactRender(render, preview);
    const readinessCompact = compactReport(releaseReadiness);
    const releasePassed = readinessCompact?.passed === true;

    return {
      contract: "CREATIVE_MASTERING_INSPECTION_V1",
      inspected_at: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name || project.title || "Creative project",
        target_channels: list(project.target_channels),
        publish_targets: list(project.metadata?.publish_targets),
      },
      production: {
        task_count: tasks.length,
        failed_count: failedTasks.length,
        running_count: runningTasks.length,
        review_count: reviewTasks.length,
        incomplete_count: incompleteTasks.length,
        failed_task_ids: failedTasks.map((task) => task.id),
        running_task_ids: runningTasks.map((task) => task.id),
        review_task_ids: reviewTasks.map((task) => task.id),
      },
      timeline: compactTimeline(timeline),
      timeline_versions: timelines.map(compactTimeline),
      render: renderCompact,
      render_count: renders.length,
      configured_profiles: variantRenders,
      quality: {
        technical: renderCompact?.technical_qc || null,
        perceptual: compactReport(perceptual),
        semantic: compactReport(semantic),
      },
      audio: {
        tracks: audioNodes,
        track_count: audioNodes.length,
        subtitle_count: subtitleNodes.length,
        subtitles: subtitleNodes,
        master_integrity: renderCompact?.final_master_audio || null,
      },
      release: {
        gate: compactReport(releaseGate),
        gate_approval: compactApproval(releaseGateApproval),
        final_render_approval: compactApproval(renderApproval),
        readiness: readinessCompact,
        passed: releasePassed,
        failed_checks: readinessCompact?.failed_checks || [],
      },
      repair: {
        plan: compactRepair(repairPlan),
        execution: compactRepair(repairExecution),
        open: Boolean(
          repairPlan &&
          !repairExecution?.technical_qc?.passed,
        ),
      },
      can_run_mastering:
        tasks.length > 0 &&
        failedTasks.length === 0 &&
        incompleteTasks.length === 0,
      can_approve_final_render: Boolean(
        render &&
        render.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED &&
        render.metadata?.technical_qc?.passed === true &&
        !renderApproval,
      ),
      can_open_publishing: Boolean(
        releasePassed &&
        renderApproval,
      ),
    };
  },
};
