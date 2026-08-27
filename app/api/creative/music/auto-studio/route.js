export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { CreativeMusicAutoStudioRuntime } from "@/lib/creative/music/runtime/CreativeMusicAutoStudioRuntime";
import { executeMusicAutoStudioLocal } from "@/lib/creative/music/runtime/CreativeMusicAutoStudioExecutionRuntime";
import {
  createMusicClip,
  createMusicMultitrackProject,
  createMusicTake,
  createMusicTrack,
  validateMusicMultitrackProject,
} from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);
const MUSIC_BUCKET = "creative-assets";
const MAX_SOURCE_BYTES = 1_073_741_824;
const MULTITRACK_METADATA_KEY = "music_multitrack_project";
const ALLOWED_EXTENSIONS = new Set([
  "wav", "mp3", "m4a", "aac", "flac", "ogg", "opus",
  "mp4", "mov", "m4v", "webm", "mkv",
]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: EXECUTION_PERMISSIONS,
  });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_AUTO_STUDIO_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

function safeFileName(value) {
  const original = text(value || "studio-source");
  const pieces = original.split(".");
  const extension = text(pieces.length > 1 ? pieces.pop() : "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_EXTENSION_INVALID");
  }
  const base = pieces.join(".")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "studio-source";
  return `${base}.${extension}`;
}

async function prepareSourceUpload(body) {
  const organizationId = text(body.organization_id);
  const fileName = safeFileName(body.file_name);
  const sizeBytes = finite(body.size_bytes, null);
  const contentType = text(body.content_type).toLowerCase();
  if (sizeBytes === null || sizeBytes <= 0 || sizeBytes > MAX_SOURCE_BYTES) {
    throw new Error(`CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_SIZE_INVALID:max=${MAX_SOURCE_BYTES}`);
  }
  if (contentType && !contentType.startsWith("audio/") && !contentType.startsWith("video/")) {
    throw new Error("CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_CONTENT_TYPE_INVALID");
  }
  const path = `${organizationId}/source/music-auto-studio/${randomUUID()}-${fileName}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_MUSIC_AUTO_STUDIO_UPLOAD_URL_REQUIRED");
  return {
    success: true,
    upload_url: data.signedUrl,
    storage_reference: `storage://${MUSIC_BUCKET}/${path}`,
    max_source_bytes: MAX_SOURCE_BYTES,
    max_source_duration_seconds: 900,
    accepted_extensions: [...ALLOWED_EXTENSIONS],
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

function multitrackType(trackRole) {
  return ["vocal", "guitar", "bass", "keys", "drums", "instrument"].includes(trackRole)
    ? trackRole
    : "audio";
}

async function appendRecordedTakeToMultitrack({
  organizationId,
  projectId,
  asset,
  title,
  trackRole,
  durationSeconds,
  body,
}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("CREATIVE_MUSIC_RECORDING_DURATION_REQUIRED_FOR_MULTITRACK");
  }
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_RECORDING_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }

  const current = project.metadata?.[MULTITRACK_METADATA_KEY] || createMusicMultitrackProject({
    id: `music-multitrack-${project.id}`,
    title: project.name || project.title || "Music Project",
    bpm: project.metadata?.music_bpm || finite(body.bpm, 96),
    time_signature: project.metadata?.music_time_signature || "4/4",
    sample_rate: finite(body.sample_rate, 48000),
  });
  const next = structuredClone(current);
  const requestedTrackId = text(body.multitrack_track_id);
  let track = requestedTrackId
    ? next.tracks.find((entry) => entry.id === requestedTrackId)
    : null;
  if (!track) {
    track = createMusicTrack({
      type: multitrackType(trackRole),
      name: text(body.track_name || `${trackRole.charAt(0).toUpperCase()}${trackRole.slice(1)} take`),
      armed: true,
    });
    next.tracks.push(track);
  }

  const startSeconds = Math.max(
    0,
    finite(body.timeline_start_seconds, finite(next.timeline?.playhead_seconds, 0)),
  );
  const take = createMusicTake({
    source_asset_id: asset.id,
    recorded_at: asset.created_at || new Date().toISOString(),
    start_seconds: startSeconds,
    duration_seconds: durationSeconds,
    selected_for_comp: track.takes.length === 0,
  });
  const clip = createMusicClip({
    source_asset_id: asset.id,
    source_version: 0,
    start_seconds: startSeconds,
    duration_seconds: durationSeconds,
    source_offset_seconds: 0,
    gain_db: 0,
    fade_in_seconds: 0,
    fade_out_seconds: 0,
  });
  track.takes.push(take);
  track.clips.push(clip);
  next.revision = Math.max(0, Math.round(finite(current.revision, 0))) + 1;
  next.timeline = {
    ...(next.timeline || {}),
    playhead_seconds: startSeconds + durationSeconds,
  };
  validateMusicMultitrackProject(next);

  const metadata = {
    ...(project.metadata || {}),
    [MULTITRACK_METADATA_KEY]: next,
    music_bpm: next.bpm,
    music_time_signature: next.time_signature,
    music_multitrack_updated_at: new Date().toISOString(),
  };
  await CreativeProjectRepository.update(project.id, { metadata });

  return {
    contract: "AVANTIQO_MUSIC_RECORDED_TAKE_MULTITRACK_LINK_V1",
    revision: next.revision,
    track_id: track.id,
    take_id: take.id,
    clip_id: clip.id,
    start_seconds: startSeconds,
    duration_seconds: durationSeconds,
    immutable_source_asset_id: asset.id,
    destructive_edit: false,
  };
}

async function registerRecordedTake(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const missionId = text(body.creative_mission_id) || null;
  const storageReference = text(body.storage_reference);
  if (!projectId) throw new Error("creative_project_id required");
  if (!storageReference.startsWith(`storage://${MUSIC_BUCKET}/${organizationId}/`)) {
    throw new Error("CREATIVE_MUSIC_RECORDING_STORAGE_REFERENCE_INVALID");
  }
  const fileName = safeFileName(body.file_name || "recording-take.wav");
  const durationSeconds = finite(body.duration_seconds, null);
  const sampleRate = finite(body.sample_rate, null);
  const channels = finite(body.channels, null);
  const peakDbfs = finite(body.peak_dbfs, null);
  const rmsDbfs = finite(body.rms_dbfs, null);
  const trackRole = text(body.track_role || "other").toLowerCase();
  const allowedRoles = new Set(["vocal", "guitar", "bass", "keys", "drums", "instrument", "room", "other"]);
  if (!allowedRoles.has(trackRole)) throw new Error("CREATIVE_MUSIC_RECORDING_TRACK_ROLE_INVALID");

  const asset = await CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId,
    asset_type: "AUDIO",
    file_url: storageReference,
    file_name: fileName,
    name: text(body.title || fileName),
    title: text(body.title || fileName),
    description: `Original ${trackRole} recording take captured in Avantiqo Music Studio.`,
    ai_generated: false,
    provider: "avantiqo-music-recorder",
    engine: "AVANTIQO_MUSIC_RECORDING_STUDIO_V1",
    metadata: {
      media_kind: "MUSIC",
      music_asset_kind: "RECORDED_TAKE",
      music_recording_contract: "AVANTIQO_MUSIC_RECORDING_STUDIO_V1",
      immutable_original_take: true,
      destructive_processing_during_capture: false,
      browser_processing_disabled: body.browser_processing_disabled === true,
      recording_track_role: trackRole,
      duration_seconds: durationSeconds,
      sample_rate: sampleRate,
      channels,
      bit_depth: 24,
      peak_dbfs: peakDbfs,
      rms_dbfs: rmsDbfs,
      clipping_detected: body.clipping_detected === true,
      recording_qc_status: text(body.recording_qc_status) || null,
      source_rights_confirmed: body.source_rights_confirmed === true,
      source_is_user_recording: true,
      source_version: 0,
    },
    tags: ["music", "recording", "original-take", trackRole],
  });

  const multitrack = await appendRecordedTakeToMultitrack({
    organizationId,
    projectId,
    asset,
    title: text(body.title || fileName),
    trackRole,
    durationSeconds,
    body,
  });

  return {
    success: true,
    contract: "AVANTIQO_MUSIC_RECORDED_TAKE_ASSET_V1",
    asset: {
      id: asset.id,
      title: asset.title || asset.name || fileName,
      file_url: asset.file_url,
      playback_url: await playbackUrl(organizationId, asset.file_url),
      metadata: asset.metadata || {},
    },
    multitrack,
    original_take_preserved: true,
    added_to_multitrack: true,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

function buildPlan(body) {
  const plan = CreativeMusicAutoStudioRuntime.plan({
    ...body,
    source_media: body.source_media || body.source_audio || body.audio,
    source_rights_confirmed: body.source_rights_confirmed === true,
  });
  return {
    success: true,
    plan,
    ready_for_local_finishing: plan.readiness.local_analyze_mix_master_ready === true,
    ready_for_full_auto_studio: plan.readiness.full_auto_studio_ready === true,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function playbackUrl(organizationId, value) {
  if (!text(value)) return null;
  return resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value,
  });
}

async function exposePrivateOutput(organizationId, result) {
  const output = result?.output || {};
  const files = Array.isArray(output.files) ? output.files : [];
  const resolvedFiles = await Promise.all(files.map(async (file) => ({
    ...file,
    private_url: file.url || null,
    url: file.url ? await playbackUrl(organizationId, file.url) : null,
  })));
  return {
    ...result,
    output: {
      ...output,
      private_master_url: output.master_url || null,
      private_waveform_url: output.waveform_url || null,
      master_url: await playbackUrl(organizationId, output.master_url),
      waveform_url: await playbackUrl(organizationId, output.waveform_url),
      files: resolvedFiles,
    },
  };
}

async function executeLocal(body) {
  const result = await executeMusicAutoStudioLocal({
    ...body,
    source_media: body.source_media || body.source_audio || body.audio,
    source_rights_confirmed: body.source_rights_confirmed === true,
  });
  return exposePrivateOutput(text(body.organization_id), result);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    }
    await requireAccess(request, organizationId);
    const action = text(body.action || "plan").toLowerCase();
    const result = action === "prepare_source_upload"
      ? await prepareSourceUpload(body)
      : action === "register_recorded_take"
        ? await registerRecordedTake(body)
        : action === "plan"
          ? buildPlan(body)
          : action === "execute_local"
            ? await executeLocal(body)
            : null;
    if (!result) {
      return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_AUTO_STUDIO_ACTION_INVALID" }, { status: 400 });
    }
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Creative Music Auto Studio failed" },
      { status: error?.status || 400 },
    );
  }
}
