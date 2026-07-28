export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as CreativeAssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  CreativePerformanceVideoIntelligenceRuntime,
} from "@/lib/creative/media/runtime/CreativePerformanceVideoIntelligenceRuntime";
import {
  uploadCreativeAsset,
} from "@/lib/creative/assets/storage/uploadCreativeAsset";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map(text).filter(Boolean);
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value) {
  return value === true || text(value).toLowerCase() === "true";
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function assertLocalPreflightEnabled(request) {
  if (!boolean(process.env.CREATIVE_LOCAL_SOURCE_PREFLIGHT_ENABLED)) {
    throw new Error("CREATIVE_LOCAL_SOURCE_PREFLIGHT_DISABLED");
  }

  const expected = text(process.env.CREATIVE_LOCAL_SOURCE_PREFLIGHT_TOKEN);
  const supplied = text(
    request.headers.get("x-avantiqo-local-preflight-token"),
  );
  if (!expected || !supplied || !constantTimeEqual(expected, supplied)) {
    throw new Error("CREATIVE_LOCAL_SOURCE_PREFLIGHT_TOKEN_INVALID");
  }
}

function assertLoopbackSource(value) {
  const url = new URL(text(value));
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "http:") {
    throw new Error("CREATIVE_LOCAL_SOURCE_PROTOCOL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("CREATIVE_LOCAL_SOURCE_HOST_INVALID");
  }
  if (url.username || url.password) {
    throw new Error("CREATIVE_LOCAL_SOURCE_CREDENTIALS_INVALID");
  }
  return url.toString();
}

function sourceType(source = {}) {
  const kind = text(source.media_kind || source.asset_type).toLowerCase();
  return kind === "logo" || kind === "image"
    ? CREATIVE_ASSET_NODE_TYPES.LOGO
    : CREATIVE_ASSET_NODE_TYPES.VIDEO;
}

function assetType(source = {}) {
  return sourceType(source) === CREATIVE_ASSET_NODE_TYPES.LOGO
    ? "logo"
    : "video";
}

function normalizeTechnical(source = {}) {
  const technical = object(source.technical);
  return {
    ...technical,
    media_kind:
      text(technical.media_kind || source.media_kind).toLowerCase() || null,
    mime_type: text(technical.mime_type || source.mime_type) || null,
    file_size_bytes: finite(
      technical.file_size_bytes ?? source.file_size_bytes,
    ),
    checksum_sha256: text(
      technical.checksum_sha256 || source.checksum_sha256,
    ) || null,
    checksum: text(
      technical.checksum ||
      technical.checksum_sha256 ||
      source.checksum_sha256,
    ) || null,
    duration_seconds: finite(
      technical.duration_seconds ?? source.duration_seconds,
    ),
    original_file_name: text(
      technical.original_file_name || source.name,
    ) || null,
  };
}

async function requireMissionProject({ organizationId, missionId, projectId }) {
  const mission = await CreativeMissionRuntime.get(missionId);
  if (!mission || String(mission.organization_id) !== String(organizationId)) {
    throw new Error("CREATIVE_PREFLIGHT_MISSION_NOT_FOUND");
  }

  const project = await CreativeProjectRuntime.get(projectId);
  if (
    !project ||
    String(project.organization_id) !== String(organizationId) ||
    String(project.creative_mission_id) !== String(missionId)
  ) {
    throw new Error("CREATIVE_PREFLIGHT_PROJECT_NOT_FOUND");
  }

  return { mission, project };
}

async function projectAssets({ organizationId, missionId, projectId }) {
  const assets = await CreativeAssetsRuntime.list({
    organization_id: organizationId,
    creative_mission_id: missionId,
    limit: 2000,
  });
  return assets.filter((asset) =>
    String(asset.metadata?.creative_project_id || "") === String(projectId),
  );
}

async function projectNodes({ organizationId, projectId }) {
  return CreativeAssetGraphRepository.listByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
  });
}

function sourceIdentity(preflightKey, source = {}, technical = {}) {
  const supplied = text(source.source_key);
  if (supplied) return supplied;
  const checksum = text(
    technical.checksum_sha256 || technical.checksum,
  );
  if (!checksum) throw new Error("CREATIVE_PREFLIGHT_SOURCE_CHECKSUM_REQUIRED");
  return crypto.createHash("sha256").update(JSON.stringify({
    preflight_key: preflightKey,
    checksum,
    asset_type: assetType(source),
  })).digest("hex");
}

async function persistLogo({
  source,
  sourceUrl,
  organizationId,
  missionId,
  projectId,
  uploadedBy,
}) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`CREATIVE_LOCAL_LOGO_FETCH_FAILED_${response.status}`);
  }
  const contentLength = finite(response.headers.get("content-length"), 0);
  const maximum = finite(
    process.env.CREATIVE_LOCAL_LOGO_MAX_BYTES,
    10 * 1024 * 1024,
  );
  if (contentLength > maximum) {
    throw new Error("CREATIVE_LOCAL_LOGO_EXCEEDS_LIMIT");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maximum) {
    throw new Error("CREATIVE_LOCAL_LOGO_EXCEEDS_LIMIT");
  }

  const file = {
    name: text(source.name) || "logo",
    type: text(source.mime_type) || "application/octet-stream",
    async arrayBuffer() {
      return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      );
    },
  };

  return uploadCreativeAsset({
    file,
    organizationId,
    creativeMissionId: missionId,
    creativeProjectId: projectId,
    uploadedBy,
  });
}

async function initPreflight({ organizationId, body }) {
  const preflightKey = text(body.preflight_key || body.preflightKey);
  const intent = text(body.intent || body.objective || body.business_goal);
  if (!preflightKey) throw new Error("CREATIVE_PREFLIGHT_KEY_REQUIRED");
  if (!intent) throw new Error("CREATIVE_PREFLIGHT_INTENT_REQUIRED");

  const missions = await CreativeMissionRuntime.list({
    organization_id: organizationId,
  });
  let mission = missions.find((candidate) =>
    candidate.metadata?.local_preflight_key === preflightKey &&
    text(candidate.status).toLowerCase() !== "archived",
  ) || null;

  if (!mission) {
    mission = await CreativeMissionRuntime.create({
      organization_id: organizationId,
      title: text(body.title) || intent.slice(0, 120),
      business_goal: intent,
      objective: intent,
      audience: object(body.audience),
      channels: list(body.channels),
      metadata: {
        ...object(body.metadata),
        source: "local_persisted_creative_preflight",
        local_preflight_key: preflightKey,
        local_preflight_status: "REGISTERING",
        production_type:
          text(body.production_type || body.productionType) || "MASTER_VIDEO",
        target_duration: finite(
          body.target_duration ?? body.duration_seconds,
          180,
        ),
        target_languages: list(body.target_languages || body.languages),
        quality_profile: text(body.quality_profile) || null,
        desired_outcome: text(body.desired_outcome) || "",
        communication_goal: text(body.communication_goal) || "",
        call_to_action: text(body.call_to_action) || "",
        tone: text(body.tone) || "",
        emotion: text(body.emotion) || "",
        selected_asset_ids: [],
        paid_production_authorized: false,
        production_started_by_preflight: false,
      },
    });
  }

  const started = await CreativeMissionRuntime.start(mission.id);
  const projectId = started.runtime_context?.creative_project_id || null;
  const briefId = started.runtime_context?.creative_brief_id || null;
  if (!projectId) throw new Error("CREATIVE_PREFLIGHT_PROJECT_REQUIRED");

  const project = await CreativeProjectRuntime.get(projectId);
  const metadata = {
    ...object(project.metadata),
    ...object(body.metadata),
    local_preflight_key: preflightKey,
    local_preflight_status:
      project.metadata?.local_preflight_status || "REGISTERING",
    local_preflight_created_at:
      project.metadata?.local_preflight_created_at || new Date().toISOString(),
    paid_production_authorized: false,
    production_started_by_preflight: false,
    target_duration: finite(
      body.target_duration ??
      project.target_duration ??
      project.metadata?.target_duration,
      180,
    ),
  };
  const updatedProject = await CreativeProjectRuntime.update(projectId, {
    metadata,
  });

  return {
    action: "INIT",
    created: !missions.some((candidate) => candidate.id === mission.id),
    creative_mission_id: started.id,
    creative_project_id: projectId,
    creative_brief_id: briefId,
    preflight_key: preflightKey,
    mission: started,
    project: updatedProject,
    production_started: false,
  };
}

async function registerSource({ organizationId, body, access }) {
  const missionId = text(body.creative_mission_id || body.mission_id);
  const projectId = text(body.creative_project_id || body.project_id);
  const source = object(body.source);
  const preflightKey = text(body.preflight_key || body.preflightKey);
  if (!missionId) throw new Error("CREATIVE_PREFLIGHT_MISSION_ID_REQUIRED");
  if (!projectId) throw new Error("CREATIVE_PREFLIGHT_PROJECT_ID_REQUIRED");
  if (!preflightKey) throw new Error("CREATIVE_PREFLIGHT_KEY_REQUIRED");

  const { project } = await requireMissionProject({
    organizationId,
    missionId,
    projectId,
  });
  if (project.metadata?.local_preflight_key !== preflightKey) {
    throw new Error("CREATIVE_PREFLIGHT_KEY_MISMATCH");
  }

  const sourceUrl = assertLoopbackSource(source.url);
  const technical = normalizeTechnical(source);
  if (!technical.checksum_sha256) {
    throw new Error("CREATIVE_PREFLIGHT_SOURCE_CHECKSUM_REQUIRED");
  }
  if (!technical.file_size_bytes || technical.file_size_bytes <= 0) {
    throw new Error("CREATIVE_PREFLIGHT_SOURCE_SIZE_REQUIRED");
  }
  if (
    sourceType(source) === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
    (!technical.duration_seconds || technical.duration_seconds <= 0)
  ) {
    throw new Error("CREATIVE_PREFLIGHT_VIDEO_DURATION_REQUIRED");
  }

  const identity = sourceIdentity(preflightKey, source, technical);
  const [assets, nodes] = await Promise.all([
    projectAssets({ organizationId, missionId, projectId }),
    projectNodes({ organizationId, projectId }),
  ]);

  let asset = assets.find((candidate) =>
    candidate.metadata?.local_preflight_source_key === identity,
  ) || null;
  let persistedUrl = sourceUrl;
  let storageEvidence = null;

  if (sourceType(source) === CREATIVE_ASSET_NODE_TYPES.LOGO) {
    if (asset?.file_url?.startsWith("storage://")) {
      persistedUrl = asset.file_url;
    } else {
      storageEvidence = await persistLogo({
        source,
        sourceUrl,
        organizationId,
        missionId,
        projectId,
        uploadedBy: access.userId || access.user?.id || null,
      });
      persistedUrl = storageEvidence.file_url;
    }
  }

  const analysis = {
    ...(asset?.analysis || {}),
    status: "TECHNICALLY_VERIFIED",
    technical_inspection: {
      status: "COMPLETE",
      ...technical,
    },
    storage_evidence: storageEvidence || asset?.analysis?.storage_evidence || null,
  };
  const metadata = {
    ...(asset?.metadata || {}),
    source: "LOCAL_PERSISTED_PREFLIGHT",
    creative_project_id: projectId,
    creative_mission_id: missionId,
    local_preflight_key: preflightKey,
    local_preflight_source_key: identity,
    local_source_url_ephemeral:
      sourceType(source) === CREATIVE_ASSET_NODE_TYPES.VIDEO,
    original_file_name: technical.original_file_name,
    mime_type: technical.mime_type,
    media_kind: technical.media_kind,
    size_bytes: technical.file_size_bytes,
    checksum_sha256: technical.checksum_sha256,
    analysis_status: "TECHNICALLY_VERIFIED",
    registered_at: asset?.metadata?.registered_at || new Date().toISOString(),
    source_url_refreshed_at: new Date().toISOString(),
    storage_bucket: storageEvidence?.bucket || asset?.metadata?.storage_bucket || null,
    storage_path: storageEvidence?.path || asset?.metadata?.storage_path || null,
  };

  if (!asset) {
    asset = await CreativeAssetsRuntime.create({
      organization_id: organizationId,
      creative_mission_id: missionId,
      creative_project_id: projectId,
      asset_type: assetType(source),
      name: technical.original_file_name || text(source.name) || "Creative source",
      description: text(source.description) || "Persisted local Creative preflight source.",
      file_url: persistedUrl,
      image_url:
        sourceType(source) === CREATIVE_ASSET_NODE_TYPES.LOGO
          ? persistedUrl
          : null,
      thumbnail_url:
        sourceType(source) === CREATIVE_ASSET_NODE_TYPES.LOGO
          ? persistedUrl
          : persistedUrl,
      analysis,
      metadata,
      tags: list(source.tags),
      created_by: access.userId || access.user?.id || null,
    });
  } else {
    asset = await CreativeAssetsRuntime.update(asset.id, {
      file_url: persistedUrl,
      image_url:
        sourceType(source) === CREATIVE_ASSET_NODE_TYPES.LOGO
          ? persistedUrl
          : asset.image_url,
      thumbnail_url:
        sourceType(source) === CREATIVE_ASSET_NODE_TYPES.LOGO
          ? persistedUrl
          : asset.thumbnail_url || persistedUrl,
      analysis,
      metadata,
    });
  }

  let node = nodes.find((candidate) =>
    candidate.metadata?.local_preflight_source_key === identity,
  ) || null;
  const nodeMetadata = {
    ...(node?.metadata || {}),
    local_preflight_key: preflightKey,
    local_preflight_source_key: identity,
    creative_mission_id: missionId,
    original_file_name: technical.original_file_name,
    source_url_ephemeral:
      sourceType(source) === CREATIVE_ASSET_NODE_TYPES.VIDEO,
    analysis_status:
      node?.metadata?.analysis_status || "REGISTERED",
    registered_at: node?.metadata?.registered_at || new Date().toISOString(),
    source_url_refreshed_at: new Date().toISOString(),
  };

  if (!node) {
    node = await CreativeAssetGraphRuntime.create({
      organization_id: organizationId,
      creative_project_id: projectId,
      creative_asset_id: asset.id,
      type: sourceType(source),
      status: CREATIVE_ASSET_NODE_STATUS.IMPORTED,
      name: asset.name || technical.original_file_name || "Creative source",
      description: asset.description || "Persisted local Creative preflight source.",
      url: persistedUrl,
      storage_path: storageEvidence?.path || metadata.storage_path || null,
      lineage: {
        source: "local_persisted_preflight",
        provider_id: null,
        capability: "creative.asset.local.register",
        generation_version: 1,
      },
      technical,
      intelligence: {
        quality_score: null,
        brand_match_score: null,
        reuse_score: null,
        safety_status: "REVIEW_REQUIRED",
        tags: list(source.tags),
      },
      reuse: {
        reusable: false,
        approved_for_reuse: false,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
        notes: "Full performance intelligence pending.",
      },
      metadata: nodeMetadata,
      created_by: access.userId || access.user?.id || null,
    });
  } else {
    node = await CreativeAssetGraphRepository.update(node.id, {
      creative_asset_id: asset.id,
      url: persistedUrl,
      storage_path: storageEvidence?.path || node.storage_path || null,
      technical,
      metadata: nodeMetadata,
    });
  }

  const selectedIds = [...new Set([
    ...list(project.metadata?.selected_asset_ids),
    asset.id,
  ])];
  await CreativeProjectRuntime.update(projectId, {
    metadata: {
      ...object(project.metadata),
      selected_asset_ids: selectedIds,
      local_preflight_status: "REGISTERING",
      local_preflight_last_registered_at: new Date().toISOString(),
      paid_production_authorized: false,
      production_started_by_preflight: false,
    },
  });

  return {
    action: "REGISTER",
    source_key: identity,
    asset,
    asset_node: node,
    technical,
    production_started: false,
  };
}

function analysisPolicy(body, node) {
  const requested = object(body.policy);
  const fileSize = finite(node.technical?.file_size_bytes, 0);
  return {
    version: text(requested.version) || "persisted-local-performance-v1",
    requested_subject:
      text(requested.requested_subject) || "primary lead vocalist",
    minimum_usable_sections:
      Math.max(1, finite(requested.minimum_usable_sections, 1)),
    minimum_verified_samples:
      Math.max(1, finite(requested.minimum_verified_samples, 2)),
    minimum_quality_score:
      finite(requested.minimum_quality_score, 55),
    minimum_primary_performer_ratio:
      finite(requested.minimum_primary_performer_ratio, 0.5),
    minimum_vocalist_ratio:
      finite(requested.minimum_vocalist_ratio, 0.5),
    minimum_section_seconds:
      finite(requested.minimum_section_seconds, 8),
    maximum_section_seconds:
      finite(requested.maximum_section_seconds, 20),
    minimum_boundary_silence_seconds:
      finite(requested.minimum_boundary_silence_seconds, 1.2),
    silence_noise_db: finite(requested.silence_noise_db, -32),
    silence_duration_seconds:
      finite(requested.silence_duration_seconds, 1.2),
    sample_fractions: Array.isArray(requested.sample_fractions)
      ? requested.sample_fractions
      : [0.2, 0.5, 0.8],
    output_width: finite(requested.output_width, 1920),
    output_height: finite(requested.output_height, 1080),
    frame_rate: finite(requested.frame_rate, 30),
    video_codec: text(requested.video_codec) || "libx264",
    video_preset: text(requested.video_preset) || "medium",
    video_crf: finite(requested.video_crf, 20),
    audio_codec: text(requested.audio_codec) || "aac",
    audio_bitrate: text(requested.audio_bitrate) || "192k",
    ffmpeg_path:
      text(requested.ffmpeg_path) ||
      text(process.env.CREATIVE_MEDIA_FFMPEG_PATH) ||
      null,
    timeout_ms: finite(
      requested.timeout_ms,
      finite(process.env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS, 60 * 60 * 1000),
    ),
    max_bytes: Math.max(
      fileSize + 1024 * 1024,
      finite(requested.max_bytes, 0),
    ),
    allow_private_networks: true,
    allowed_hosts: ["127.0.0.1", "localhost"],
  };
}

async function analyseSource({ organizationId, body }) {
  const missionId = text(body.creative_mission_id || body.mission_id);
  const projectId = text(body.creative_project_id || body.project_id);
  const sourceNodeId = text(body.parent_asset_node_id || body.source_asset_node_id);
  if (!missionId) throw new Error("CREATIVE_PREFLIGHT_MISSION_ID_REQUIRED");
  if (!projectId) throw new Error("CREATIVE_PREFLIGHT_PROJECT_ID_REQUIRED");
  if (!sourceNodeId) throw new Error("CREATIVE_PREFLIGHT_SOURCE_NODE_REQUIRED");

  const { project } = await requireMissionProject({
    organizationId,
    missionId,
    projectId,
  });
  const node = await CreativeAssetGraphRepository.getById(sourceNodeId);
  if (
    !node ||
    String(node.organization_id) !== String(organizationId) ||
    String(node.creative_project_id) !== String(projectId) ||
    node.type !== CREATIVE_ASSET_NODE_TYPES.VIDEO
  ) {
    throw new Error("CREATIVE_PREFLIGHT_VIDEO_NODE_NOT_FOUND");
  }
  if (body.source_url) {
    const refreshedUrl = assertLoopbackSource(body.source_url);
    await CreativeAssetGraphRepository.update(node.id, {
      url: refreshedUrl,
      metadata: {
        ...object(node.metadata),
        source_url_refreshed_at: new Date().toISOString(),
      },
    });
    node.url = refreshedUrl;
  }

  const progress = object(project.metadata?.local_preflight_analysis_progress);
  const startedAt = new Date().toISOString();
  await CreativeProjectRuntime.update(projectId, {
    metadata: {
      ...object(project.metadata),
      local_preflight_status: "ANALYSING",
      local_preflight_analysis_progress: {
        ...progress,
        [node.id]: {
          status: "RUNNING",
          started_at: startedAt,
          source_name: node.name,
        },
      },
      paid_production_authorized: false,
      production_started_by_preflight: false,
    },
  });

  try {
    const result = await CreativePerformanceVideoIntelligenceRuntime.analyze({
      organization_id: organizationId,
      parent_asset_node_id: node.id,
      policy: analysisPolicy(body, node),
      force: body.force === true,
    });

    const completedProject = await CreativeProjectRuntime.get(projectId);
    await CreativeProjectRuntime.update(projectId, {
      metadata: {
        ...object(completedProject.metadata),
        local_preflight_status: "ANALYSING",
        local_preflight_analysis_progress: {
          ...object(completedProject.metadata?.local_preflight_analysis_progress),
          [node.id]: {
            status: "COMPLETE",
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            source_name: node.name,
            analysis_identity: result.analysis_identity,
            reused: result.reused === true,
            verified_moment_count: result.moments?.length || 0,
          },
        },
        paid_production_authorized: false,
        production_started_by_preflight: false,
      },
    });

    return {
      action: "ANALYSE",
      source_asset_node_id: node.id,
      source_name: node.name,
      reused: result.reused === true,
      analysis_identity: result.analysis_identity,
      verified_moment_count: result.moments?.length || 0,
      verified_moment_ids: (result.moments || []).map((moment) => moment.id),
      detected_section_count: result.detected_sections?.length || null,
      production_started: false,
    };
  } catch (error) {
    const failedProject = await CreativeProjectRuntime.get(projectId);
    await CreativeProjectRuntime.update(projectId, {
      metadata: {
        ...object(failedProject.metadata),
        local_preflight_status: "ANALYSIS_BLOCKED",
        local_preflight_analysis_progress: {
          ...object(failedProject.metadata?.local_preflight_analysis_progress),
          [node.id]: {
            status: "FAILED",
            started_at: startedAt,
            failed_at: new Date().toISOString(),
            source_name: node.name,
            error: error?.message || String(error),
            validation: error?.validation || null,
          },
        },
        paid_production_authorized: false,
        production_started_by_preflight: false,
      },
    });
    throw error;
  }
}

async function preflightStatus({ organizationId, body }) {
  const missionId = text(body.creative_mission_id || body.mission_id);
  const projectId = text(body.creative_project_id || body.project_id);
  if (!missionId) throw new Error("CREATIVE_PREFLIGHT_MISSION_ID_REQUIRED");
  if (!projectId) throw new Error("CREATIVE_PREFLIGHT_PROJECT_ID_REQUIRED");

  const { mission, project } = await requireMissionProject({
    organizationId,
    missionId,
    projectId,
  });
  const [assets, nodes] = await Promise.all([
    projectAssets({ organizationId, missionId, projectId }),
    projectNodes({ organizationId, projectId }),
  ]);
  const sourceVideos = nodes.filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
    !node.parent_asset_node_id &&
    text(node.lineage?.source) === "local_persisted_preflight",
  );
  const logos = nodes.filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.LOGO &&
    text(node.lineage?.source) === "local_persisted_preflight",
  );
  const moments = nodes.filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
    node.metadata?.performance_verified === true &&
    node.metadata?.blocked !== true &&
    Boolean(node.url),
  );
  const verifiedSourceIds = new Set(
    moments.map((node) => text(node.metadata?.source_asset_node_id)).filter(Boolean),
  );
  const verifiedDuration = moments.reduce((sum, node) => sum + finite(
    node.technical?.duration_seconds ??
    node.metadata?.original_source_range?.duration_seconds,
    0,
  ), 0);
  const targetDuration = finite(
    project.target_duration ?? project.metadata?.target_duration,
    0,
  );
  const ready =
    sourceVideos.length > 0 &&
    logos.length > 0 &&
    moments.length > 0 &&
    verifiedSourceIds.size > 0 &&
    (targetDuration <= 0 || verifiedDuration >= targetDuration);

  if (ready && project.metadata?.local_preflight_status !== "READY_TO_RESUME") {
    await CreativeProjectRuntime.update(projectId, {
      metadata: {
        ...object(project.metadata),
        local_preflight_status: "READY_TO_RESUME",
        local_preflight_ready_at: new Date().toISOString(),
        persisted_verified_duration_seconds: verifiedDuration,
        persisted_verified_source_count: verifiedSourceIds.size,
        paid_production_authorized: false,
        production_started_by_preflight: false,
      },
    });
  }

  return {
    action: "STATUS",
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    mission_status: mission.status,
    project_status: project.status,
    local_preflight_status:
      ready ? "READY_TO_RESUME" : project.metadata?.local_preflight_status || null,
    asset_count: assets.length,
    source_video_count: sourceVideos.length,
    logo_count: logos.length,
    verified_moment_count: moments.length,
    verified_source_count: verifiedSourceIds.size,
    verified_duration_seconds: Number(verifiedDuration.toFixed(3)),
    target_duration_seconds: targetDuration,
    ready_to_resume: ready,
    paid_production_authorized: false,
    production_started: false,
    source_videos: sourceVideos.map((node) => ({
      id: node.id,
      creative_asset_id: node.creative_asset_id,
      name: node.name,
      checksum_sha256:
        node.technical?.checksum_sha256 || node.technical?.checksum || null,
      duration_seconds: node.technical?.duration_seconds || null,
      analysis_progress:
        project.metadata?.local_preflight_analysis_progress?.[node.id] || null,
    })),
    logo_nodes: logos.map((node) => ({
      id: node.id,
      creative_asset_id: node.creative_asset_id,
      name: node.name,
      url: node.url,
    })),
    verified_moment_ids: moments.map((node) => node.id),
  };
}

function statusFor(error) {
  const message = text(error?.message).toUpperCase();
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("TOKEN_INVALID")) return 403;
  if (message.includes("DISABLED")) return 403;
  if (
    message.includes("REQUIRED") ||
    message.includes("INVALID") ||
    message.includes("MISMATCH") ||
    message.includes("EXCEEDS")
  ) return 400;
  return 500;
}

export async function POST(request) {
  try {
    assertLocalPreflightEnabled(request);
    const body = await request.json();
    const organizationId = text(
      body.organization_id || body.organizationId,
    );
    const action = text(body.action).toUpperCase();
    if (!organizationId) throw new Error("organization_id required");
    if (!["INIT", "REGISTER", "ANALYSE", "STATUS"].includes(action)) {
      throw new Error("CREATIVE_PREFLIGHT_ACTION_INVALID");
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.asset.upload",
        "creative.execute",
        "creative.production.run",
      ],
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    let result;
    if (action === "INIT") {
      result = await initPreflight({ organizationId, body });
    } else if (action === "REGISTER") {
      result = await registerSource({ organizationId, body, access });
    } else if (action === "ANALYSE") {
      result = await analyseSource({ organizationId, body });
    } else {
      result = await preflightStatus({ organizationId, body });
    }

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error?.message || String(error),
      validation:
        error?.validation || error?.cause?.validation || null,
    }, { status: statusFor(error) });
  }
}
