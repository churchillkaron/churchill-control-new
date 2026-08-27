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
import { analyzeMusicMusicalContent } from "@/lib/creative/music/runtime/CreativeMusicMusicalAnalysisRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_multitrack_project";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_MUSICAL_ANALYSIS_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_PROJECT_NOT_FOUND");
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

function resolveClip(session, trackId, clipId) {
  const track = session.tracks?.find((entry) => entry.id === trackId);
  const clip = track?.clips?.find((entry) => entry.id === clipId);
  if (!track || !clip) throw new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_CLIP_NOT_FOUND");
  return { track, clip };
}

function assertRevision(session, expectedRevision) {
  const current = Math.max(0, Math.round(finite(session.revision, 0)));
  const expected = Math.max(0, Math.round(finite(expectedRevision, -1)));
  if (current !== expected) {
    const error = new Error(`CREATIVE_MUSIC_MUSICAL_ANALYSIS_REVISION_CONFLICT:expected=${expected}:current=${current}`);
    error.status = 409;
    throw error;
  }
  return current;
}

async function analyzeClip({ project, organizationId, projectId, session, trackId, clipId }) {
  const { clip } = resolveClip(session, trackId, clipId);
  const asset = await CreativeAssetsRuntime.get(clip.source_asset_id);
  const assetProjectId = text(asset?.creative_project_id || asset?.metadata?.creative_project_id);
  if (!asset || String(asset.organization_id) !== String(organizationId) || String(assetProjectId) !== String(projectId)) {
    throw new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_SOURCE_ASSET_NOT_FOUND");
  }
  return analyzeMusicMusicalContent({
    organization_id: organizationId,
    source_url: asset.file_url,
    source_file_name: asset.file_name || `${asset.id}.wav`,
    source_mime_type: asset.metadata?.mime_type || null,
    source_offset_seconds: clip.source_offset_seconds,
    duration_seconds: clip.duration_seconds,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    const trackId = text(body.track_id);
    const clipId = text(body.clip_id);
    const action = text(body.action || "analyze").toLowerCase();
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    if (!projectId || !trackId || !clipId) return NextResponse.json({ success: false, error: "creative_project_id, track_id and clip_id required" }, { status: 400 });
    await requireAccess(request, organizationId);

    const project = await projectInScope(organizationId, projectId);
    const session = normalizeSession(project.metadata?.[METADATA_KEY]);
    const revision = assertRevision(session, body.expected_revision);
    const { clip } = resolveClip(session, trackId, clipId);

    if (action === "analyze") {
      const analysis = await analyzeClip({ project, organizationId, projectId, session, trackId, clipId });
      const next = structuredClone(session);
      const nextTrack = next.tracks.find((entry) => entry.id === trackId);
      const nextClip = nextTrack.clips.find((entry) => entry.id === clipId);
      nextClip.musical_analysis = {
        ...analysis,
        source_asset_id: clip.source_asset_id,
        source_offset_seconds: clip.source_offset_seconds,
        source_duration_seconds: clip.duration_seconds,
        analysed_at: new Date().toISOString(),
      };
      next.revision = revision + 1;
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
        contract: "AVANTIQO_MUSIC_CLIP_MUSICAL_ANALYSIS_V1",
        analysis,
        revision: next.revision,
        session_values_changed: false,
        provider_job_submitted: false,
        endpoint_mutation_performed: false,
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    if (action === "apply") {
      const stored = clip.musical_analysis;
      if (!stored || stored.source_asset_id !== clip.source_asset_id || Math.abs(finite(stored.source_offset_seconds, -1) - finite(clip.source_offset_seconds, 0)) > 0.001 || Math.abs(finite(stored.source_duration_seconds, -1) - finite(clip.duration_seconds, 0)) > 0.01) {
        throw new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_STALE_OR_MISSING");
      }
      const fields = Array.isArray(body.fields) ? body.fields.map((value) => text(value).toLowerCase()) : [];
      if (!fields.length) throw new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_APPLY_FIELDS_REQUIRED");
      const next = structuredClone(session);
      if (fields.includes("bpm")) {
        if (!Number.isFinite(Number(stored.accepted?.bpm))) throw new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_BPM_NOT_ACCEPTED");
        next.bpm = Math.max(30, Math.min(300, Math.round(Number(stored.accepted.bpm))));
      }
      if (fields.includes("key")) {
        if (!stored.accepted?.key || !stored.accepted?.mode) throw new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_KEY_NOT_ACCEPTED");
        next.musical_key = {
          key: stored.accepted.key,
          mode: stored.accepted.mode,
          label: stored.accepted.key_label,
          source: "measured_clip_analysis",
          source_track_id: trackId,
          source_clip_id: clipId,
          confidence: stored.key?.confidence ?? null,
        };
      }
      next.revision = revision + 1;
      normalizeSession(next);
      await CreativeProjectRepository.update(project.id, {
        metadata: {
          ...(project.metadata || {}),
          [METADATA_KEY]: next,
          music_bpm: next.bpm,
          music_key: next.musical_key || project.metadata?.music_key || null,
          music_multitrack_updated_at: new Date().toISOString(),
        },
      });
      return NextResponse.json({
        success: true,
        contract: "AVANTIQO_MUSIC_MUSICAL_ANALYSIS_APPLY_V1",
        revision: next.revision,
        applied_fields: fields,
        bpm: next.bpm,
        musical_key: next.musical_key || null,
        explicit_musician_apply: true,
        provider_job_submitted: false,
        endpoint_mutation_performed: false,
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_MUSICAL_ANALYSIS_ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Music musical analysis failed",
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: error?.status || 400 });
  }
}
