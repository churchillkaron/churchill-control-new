export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { renderMusicClipCorrection } from "@/lib/creative/music/runtime/CreativeMusicClipCorrectionRuntime";
import { validateMusicClipEdit } from "@/lib/creative/music/runtime/CreativeMusicClipEditRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const MUSIC_BUCKET = "creative-assets";
const METADATA_KEY = "music_multitrack_project";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

function safeName(value) {
  return text(value || "corrected-clip")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "corrected-clip";
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_CLIP_CORRECTION_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_CLIP_CORRECTION_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

function normalizedSession(session) {
  const next = ensureMusicEngineeringBuses(session);
  validateMusicMultitrackProject(next);
  validateMusicMixerRouting(next);
  validateMusicGroupProcessing(next);
  validateMusicAutomation(next);
  for (const track of next.tracks || []) validateMusicClipEdit(track);
  return next;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    const trackId = text(body.track_id);
    const clipId = text(body.clip_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    if (!trackId || !clipId) return NextResponse.json({ success: false, error: "track_id and clip_id required" }, { status: 400 });
    await requireAccess(request, organizationId);

    const project = await projectInScope(organizationId, projectId);
    const session = normalizedSession(project.metadata?.[METADATA_KEY]);
    const currentRevision = Math.max(0, Math.round(finite(session.revision, 0)));
    const expectedRevision = Math.max(0, Math.round(finite(body.expected_revision, -1)));
    if (expectedRevision !== currentRevision) {
      const error = new Error(`CREATIVE_MUSIC_CLIP_CORRECTION_REVISION_CONFLICT:expected=${expectedRevision}:current=${currentRevision}`);
      error.status = 409;
      throw error;
    }

    const track = session.tracks?.find((entry) => entry.id === trackId);
    const clip = track?.clips?.find((entry) => entry.id === clipId);
    if (!track || !clip) throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_CLIP_NOT_FOUND");
    if (clip.preserve_source_asset !== true || clip.destructive_edit === true) throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_NON_DESTRUCTIVE_SOURCE_REQUIRED");
    const sourceAsset = await CreativeAssetsRuntime.get(clip.source_asset_id);
    if (!sourceAsset || String(sourceAsset.organization_id) !== String(organizationId) || String(sourceAsset.creative_project_id) !== String(projectId)) {
      throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_SOURCE_ASSET_NOT_FOUND");
    }

    const rendered = await renderMusicClipCorrection({
      organization_id: organizationId,
      source_url: sourceAsset.file_url,
      source_file_name: sourceAsset.file_name || `${sourceAsset.id}.wav`,
      source_mime_type: sourceAsset.metadata?.mime_type || null,
      source_offset_seconds: clip.source_offset_seconds,
      duration_seconds: clip.duration_seconds,
      sample_rate: session.sample_rate || 48000,
      correction: body.correction || {},
    });

    const correctionLabel = [
      Math.abs(rendered.correction.total_pitch_semitones) >= 0.0001 ? `${rendered.correction.total_pitch_semitones.toFixed(2)}st` : null,
      Math.abs(rendered.correction.timing_percent - 100) >= 0.0001 ? `${rendered.correction.timing_percent.toFixed(1)}pct` : null,
    ].filter(Boolean).join("-") || "corrected";
    const fileName = `${safeName(track.name || "track")}-${safeName(correctionLabel)}-${randomUUID().slice(0, 8)}.wav`;
    const storagePath = `${organizationId}/derived/music-clip-correction/${projectId}/r${currentRevision}/${fileName}`;
    const supabase = getServiceSupabase();
    const { error: uploadError } = await supabase.storage.from(MUSIC_BUCKET).upload(storagePath, rendered.buffer, {
      contentType: "audio/wav",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const storageReference = `storage://${MUSIC_BUCKET}/${storagePath}`;

    const derivedAsset = await CreativeAssetsRuntime.create({
      organization_id: organizationId,
      creative_project_id: projectId,
      creative_mission_id: project.creative_mission_id || null,
      asset_type: "AUDIO",
      file_url: storageReference,
      file_name: fileName,
      name: `${track.name || "Track"} corrected clip`,
      title: `${track.name || "Track"} corrected clip`,
      description: "Non-destructive Music Workstation clip pitch/timing correction render.",
      ai_generated: false,
      provider: "avantiqo-music-workstation",
      engine: rendered.contract,
      prompt: null,
      metadata: {
        media_kind: "MUSIC",
        mime_type: "audio/wav",
        music_asset_kind: "CLIP_CORRECTION_RENDER",
        track_id: track.id,
        clip_id: clip.id,
        project_revision_source: currentRevision,
        source_asset_id: sourceAsset.id,
        source_checksum: rendered.source_checksum,
        source_offset_seconds: finite(clip.source_offset_seconds, 0),
        source_duration_seconds: finite(clip.duration_seconds, 0),
        output_duration_seconds: rendered.output_probe.duration_seconds,
        sample_rate: rendered.output_probe.sample_rate,
        channels: rendered.output_probe.channels,
        bit_depth: 24,
        correction: rendered.correction,
        original_source_preserved: true,
        derived_asset: true,
        destructive_edit: false,
        rendered_at: new Date().toISOString(),
      },
      tags: ["music", "clip", "correction", "derived", "24-bit"],
    });

    const next = structuredClone(session);
    const nextTrack = next.tracks.find((entry) => entry.id === trackId);
    const nextClip = nextTrack.clips.find((entry) => entry.id === clipId);
    nextClip.source_asset_history = [
      ...(Array.isArray(nextClip.source_asset_history) ? nextClip.source_asset_history : []),
      {
        source_asset_id: clip.source_asset_id,
        source_offset_seconds: finite(clip.source_offset_seconds, 0),
        duration_seconds: finite(clip.duration_seconds, 0),
        replaced_by_correction_asset_id: derivedAsset.id,
        correction_contract: rendered.contract,
        preserved: true,
      },
    ];
    nextClip.source_asset_id = derivedAsset.id;
    nextClip.source_offset_seconds = 0;
    nextClip.duration_seconds = rendered.output_probe.duration_seconds;
    nextClip.correction = rendered.correction;
    nextClip.correction_asset_id = derivedAsset.id;
    nextClip.correction_source_asset_id = sourceAsset.id;
    nextClip.preserve_source_asset = true;
    nextClip.destructive_edit = false;
    next.revision = currentRevision + 1;
    next.non_destructive_editing = true;
    next.preserve_original_sources = true;
    normalizedSession(next);

    await CreativeProjectRepository.update(project.id, {
      metadata: {
        ...(project.metadata || {}),
        [METADATA_KEY]: next,
        music_multitrack_updated_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      contract: "AVANTIQO_MUSIC_CLIP_CORRECTION_ASSET_V1",
      asset_id: derivedAsset.id,
      source_asset_id: sourceAsset.id,
      track_id: trackId,
      clip_id: clipId,
      revision: next.revision,
      correction: rendered.correction,
      output_duration_seconds: rendered.output_probe.duration_seconds,
      original_source_preserved: true,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Music clip correction failed",
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: error?.status || 400 });
  }
}
