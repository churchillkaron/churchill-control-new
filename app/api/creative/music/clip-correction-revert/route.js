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
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_multitrack_project";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_CLIP_CORRECTION_REVERT_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_CLIP_CORRECTION_REVERT_PROJECT_NOT_FOUND");
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
    if (expectedRevision !== currentRevision) {
      const error = new Error(`CREATIVE_MUSIC_CLIP_CORRECTION_REVERT_REVISION_CONFLICT:expected=${expectedRevision}:current=${currentRevision}`);
      error.status = 409;
      throw error;
    }

    const track = session.tracks?.find((entry) => entry.id === trackId);
    const clip = track?.clips?.find((entry) => entry.id === clipId);
    if (!track || !clip) throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_REVERT_CLIP_NOT_FOUND");
    const history = Array.isArray(clip.source_asset_history) ? clip.source_asset_history : [];
    const previous = history.at(-1);
    if (!previous?.source_asset_id || previous.preserved !== true) {
      throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_REVERT_HISTORY_REQUIRED");
    }
    const restoredAsset = await CreativeAssetsRuntime.get(previous.source_asset_id);
    const restoredProjectId = text(restoredAsset?.creative_project_id || restoredAsset?.metadata?.creative_project_id);
    if (!restoredAsset || String(restoredAsset.organization_id) !== String(organizationId) || String(restoredProjectId) !== String(projectId)) {
      throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_REVERT_SOURCE_NOT_FOUND");
    }

    const next = structuredClone(session);
    const nextTrack = next.tracks.find((entry) => entry.id === trackId);
    const nextClip = nextTrack.clips.find((entry) => entry.id === clipId);
    const correctionAssetId = text(nextClip.correction_asset_id || nextClip.source_asset_id);
    nextClip.source_asset_history = history.slice(0, -1);
    nextClip.correction_revert_history = [
      ...(Array.isArray(nextClip.correction_revert_history) ? nextClip.correction_revert_history : []),
      {
        correction_asset_id: correctionAssetId || null,
        restored_source_asset_id: previous.source_asset_id,
        restored_at: new Date().toISOString(),
        correction_asset_preserved: true,
      },
    ];
    nextClip.source_asset_id = previous.source_asset_id;
    nextClip.source_offset_seconds = Math.max(0, finite(previous.source_offset_seconds, 0));
    nextClip.duration_seconds = Math.max(0.001, finite(previous.duration_seconds, nextClip.duration_seconds));
    delete nextClip.correction;
    delete nextClip.correction_asset_id;
    delete nextClip.correction_source_asset_id;
    nextClip.preserve_source_asset = true;
    nextClip.destructive_edit = false;
    next.revision = currentRevision + 1;
    next.non_destructive_editing = true;
    next.preserve_original_sources = true;
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
      contract: "AVANTIQO_MUSIC_CLIP_CORRECTION_REVERT_V1",
      track_id: trackId,
      clip_id: clipId,
      restored_source_asset_id: previous.source_asset_id,
      preserved_correction_asset_id: correctionAssetId || null,
      revision: next.revision,
      original_source_preserved: true,
      correction_asset_preserved: true,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Music clip correction revert failed",
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: error?.status || 400 });
  }
}
