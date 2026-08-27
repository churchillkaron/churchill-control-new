export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { validateMusicClipEdit } from "@/lib/creative/music/runtime/CreativeMusicClipEditRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { analyzeMusicVocalPitch } from "@/lib/creative/music/runtime/CreativeMusicVocalPitchAnalysisRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_multitrack_project";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_VOCAL_PITCH_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_VOCAL_PITCH_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

function normalizeSession(session) {
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
    if (!projectId || !trackId || !clipId) return NextResponse.json({ success: false, error: "creative_project_id, track_id and clip_id required" }, { status: 400 });
    await requireAccess(request, organizationId);

    const project = await projectInScope(organizationId, projectId);
    const session = normalizeSession(project.metadata?.[METADATA_KEY]);
    const currentRevision = Math.max(0, Math.round(finite(session.revision, 0)));
    const expectedRevision = Math.max(0, Math.round(finite(body.expected_revision, -1)));
    if (currentRevision !== expectedRevision) {
      const error = new Error(`CREATIVE_MUSIC_VOCAL_PITCH_REVISION_CONFLICT:expected=${expectedRevision}:current=${currentRevision}`);
      error.status = 409;
      throw error;
    }

    const track = session.tracks?.find((entry) => entry.id === trackId);
    const clip = track?.clips?.find((entry) => entry.id === clipId);
    if (!track || !clip) throw new Error("CREATIVE_MUSIC_VOCAL_PITCH_CLIP_NOT_FOUND");
    if (track.type !== "vocal") throw new Error("CREATIVE_MUSIC_VOCAL_PITCH_VOCAL_TRACK_REQUIRED");

    const asset = await CreativeAssetsRuntime.get(clip.source_asset_id);
    const assetProjectId = text(asset?.creative_project_id || asset?.metadata?.creative_project_id);
    if (!asset || String(asset.organization_id) !== String(organizationId) || String(assetProjectId) !== String(projectId)) {
      throw new Error("CREATIVE_MUSIC_VOCAL_PITCH_SOURCE_ASSET_NOT_FOUND");
    }

    const analysis = await analyzeMusicVocalPitch({
      organization_id: organizationId,
      source_url: asset.file_url,
      source_file_name: asset.file_name || `${asset.id}.wav`,
      source_mime_type: asset.metadata?.mime_type || null,
      source_offset_seconds: clip.source_offset_seconds,
      duration_seconds: clip.duration_seconds,
    });

    const next = structuredClone(session);
    const nextTrack = next.tracks.find((entry) => entry.id === trackId);
    const nextClip = nextTrack.clips.find((entry) => entry.id === clipId);
    nextClip.vocal_pitch_analysis = {
      ...analysis,
      source_asset_id: clip.source_asset_id,
      source_offset_seconds: clip.source_offset_seconds,
      source_duration_seconds: clip.duration_seconds,
      analysed_at: new Date().toISOString(),
    };
    next.revision = currentRevision + 1;
    normalizeSession(next);

    await CreativeProjectRepository.update(project.id, {
      metadata: {
        ...(project.metadata || {}),
        [METADATA_KEY]: next,
        music_multitrack_updated_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      contract: "AVANTIQO_MUSIC_CLIP_VOCAL_PITCH_ANALYSIS_V1",
      analysis,
      revision: next.revision,
      correction_applied: false,
      auto_tune_applied: false,
      formant_processing_applied: false,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Music vocal pitch analysis failed",
      correction_applied: false,
      auto_tune_applied: false,
      formant_processing_applied: false,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: error?.status || 400 });
  }
}
