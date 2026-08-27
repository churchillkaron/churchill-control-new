export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);
const MUSIC_BUCKET = "creative-assets";
const MULTITRACK_METADATA_KEY = "music_multitrack_project";
const MAX_RENDER_BYTES = 1_073_741_824;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sortedUnique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))].sort();
}

function safeWavName(value) {
  const original = text(value || "music-comp.wav");
  if (!/\.wav$/i.test(original)) throw new Error("CREATIVE_MUSIC_COMP_RENDER_WAV_REQUIRED");
  const base = original
    .replace(/\.wav$/i, "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "music-comp";
  return `${base}.wav`;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: EXECUTION_PERMISSIONS,
  });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_COMP_RENDER_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_COMP_RENDER_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

async function prepareUpload(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  await projectInScope(organizationId, projectId);
  const fileName = safeWavName(body.file_name);
  const sizeBytes = finite(body.size_bytes, null);
  if (sizeBytes === null || sizeBytes <= 0 || sizeBytes > MAX_RENDER_BYTES) {
    throw new Error(`CREATIVE_MUSIC_COMP_RENDER_SIZE_INVALID:max=${MAX_RENDER_BYTES}`);
  }
  const path = `${organizationId}/derived/music-comp/${projectId}/${randomUUID()}-${fileName}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_MUSIC_COMP_RENDER_UPLOAD_URL_REQUIRED");
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_COMP_RENDER_UPLOAD_V1",
    upload_url: data.signedUrl,
    storage_reference: `storage://${MUSIC_BUCKET}/${path}`,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function registerRender(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const trackId = text(body.track_id);
  const compId = text(body.comp_id);
  const storageReference = text(body.storage_reference);
  const expectedRevision = Math.max(0, Math.round(finite(body.expected_revision, 0)));
  if (!trackId || !compId) throw new Error("CREATIVE_MUSIC_COMP_RENDER_IDENTITY_REQUIRED");
  if (!storageReference.startsWith(`storage://${MUSIC_BUCKET}/${organizationId}/derived/music-comp/${projectId}/`)) {
    throw new Error("CREATIVE_MUSIC_COMP_RENDER_STORAGE_REFERENCE_INVALID");
  }

  const project = await projectInScope(organizationId, projectId);
  const current = project.metadata?.[MULTITRACK_METADATA_KEY];
  if (!current) throw new Error("CREATIVE_MUSIC_COMP_RENDER_MULTITRACK_REQUIRED");
  const currentRevision = Math.max(0, Math.round(finite(current.revision, 0)));
  if (expectedRevision !== currentRevision) {
    const error = new Error(`CREATIVE_MUSIC_COMP_RENDER_REVISION_CONFLICT:expected=${expectedRevision}:current=${currentRevision}`);
    error.status = 409;
    throw error;
  }
  const track = current.tracks?.find((entry) => entry.id === trackId);
  if (!track?.comp || track.comp.id !== compId) throw new Error("CREATIVE_MUSIC_COMP_RENDER_COMP_NOT_CURRENT");
  if (track.comp.destructive_edit === true || track.comp.preserve_all_source_takes !== true) {
    throw new Error("CREATIVE_MUSIC_COMP_RENDER_NON_DESTRUCTIVE_REQUIRED");
  }

  const submittedTakeIds = sortedUnique(body.source_take_ids || []);
  const submittedAssetIds = sortedUnique(body.source_asset_ids || []);
  const expectedTakeIds = sortedUnique(track.comp.source_take_ids || track.comp.regions?.map((region) => region.take_id) || []);
  const expectedAssetIds = sortedUnique(track.comp.source_asset_ids || track.comp.regions?.map((region) => region.source_asset_id) || []);
  if (JSON.stringify(submittedTakeIds) !== JSON.stringify(expectedTakeIds)) {
    throw new Error("CREATIVE_MUSIC_COMP_RENDER_TAKE_LINEAGE_MISMATCH");
  }
  if (JSON.stringify(submittedAssetIds) !== JSON.stringify(expectedAssetIds)) {
    throw new Error("CREATIVE_MUSIC_COMP_RENDER_ASSET_LINEAGE_MISMATCH");
  }

  const fileName = safeWavName(body.file_name);
  const durationSeconds = finite(body.duration_seconds, null);
  const sampleRate = finite(body.sample_rate, null);
  const channels = finite(body.channels, null);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("CREATIVE_MUSIC_COMP_RENDER_DURATION_REQUIRED");

  const asset = await CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: project.creative_mission_id || null,
    asset_type: "AUDIO",
    file_url: storageReference,
    file_name: fileName,
    name: text(body.title || `${track.name || "Track"} Comp`),
    title: text(body.title || `${track.name || "Track"} Comp`),
    description: `Derived non-destructive comp render for ${track.name || "Music track"}.`,
    ai_generated: false,
    provider: "avantiqo-music-workstation",
    engine: "AVANTIQO_MUSIC_COMP_RENDER_V1",
    metadata: {
      media_kind: "MUSIC",
      music_asset_kind: "COMP_RENDER",
      comp_id: compId,
      track_id: trackId,
      duration_seconds: durationSeconds,
      sample_rate: sampleRate,
      channels,
      bit_depth: 24,
      dry_comp_render: true,
      channel_strip_applied: false,
      source_take_ids: expectedTakeIds,
      source_asset_ids: expectedAssetIds,
      source_takes_preserved: true,
      destructive_edit: false,
      derived_asset: true,
    },
    tags: ["music", "comp", "derived", "24-bit"],
  });

  const next = structuredClone(current);
  const nextTrack = next.tracks.find((entry) => entry.id === trackId);
  nextTrack.comp = {
    ...nextTrack.comp,
    rendered_asset_id: asset.id,
    rendered_storage_reference: asset.file_url,
    rendered_at: new Date().toISOString(),
    rendered_revision: currentRevision + 1,
    render_format: "WAV_24BIT_PCM",
    channel_strip_applied: false,
    source_takes_preserved: true,
  };
  next.revision = currentRevision + 1;
  validateMusicMultitrackProject(next);
  await CreativeProjectRepository.update(project.id, {
    metadata: {
      ...(project.metadata || {}),
      [MULTITRACK_METADATA_KEY]: next,
      music_multitrack_updated_at: new Date().toISOString(),
    },
  });

  return {
    success: true,
    contract: "AVANTIQO_MUSIC_COMP_RENDER_ASSET_V1",
    asset_id: asset.id,
    storage_reference: asset.file_url,
    revision: next.revision,
    dry_comp_render: true,
    channel_strip_applied: false,
    source_takes_preserved: true,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "prepare_upload").toLowerCase();
    const result = action === "prepare_upload"
      ? await prepareUpload(body)
      : action === "register"
        ? await registerRender(body)
        : null;
    if (!result) return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_COMP_RENDER_ACTION_INVALID" }, { status: 400 });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Creative Music comp render failed" },
      { status: error?.status || 400 },
    );
  }
}
