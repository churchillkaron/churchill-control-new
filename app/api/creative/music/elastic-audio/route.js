export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import {
  analyzeMusicElasticAudio,
  buildMusicElasticWarpPlan,
  reviewMusicElasticWarpMarker,
} from "@/lib/creative/music/runtime/CreativeMusicElasticAudioRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_multitrack_project";
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_ELASTIC_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) { const error = new Error("CREATIVE_MUSIC_ELASTIC_PROJECT_NOT_FOUND"); error.status = 404; throw error; }
  return project;
}

function normalizedSession(value) {
  const session = ensureMusicEngineeringBuses(value);
  validateMusicMultitrackProject(session);
  validateMusicMixerRouting(session);
  return session;
}

function selectClip(session, trackId, clipId) {
  const track = session.tracks?.find((entry) => entry.id === trackId);
  const clip = track?.clips?.find((entry) => entry.id === clipId);
  if (!track || !clip) throw new Error("CREATIVE_MUSIC_ELASTIC_CLIP_NOT_FOUND");
  return { track, clip };
}

function assertRevision(session, expectedRevision) {
  const current = Math.max(0, Math.round(finite(session.revision, 0)));
  const expected = Math.max(0, Math.round(finite(expectedRevision, -1)));
  if (current !== expected) { const error = new Error(`CREATIVE_MUSIC_ELASTIC_REVISION_CONFLICT:expected=${expected}:current=${current}`); error.status = 409; throw error; }
  return current;
}

async function persist(project, session) {
  const next = normalizedSession(session);
  await CreativeProjectRepository.update(project.id, { metadata: { ...(project.metadata || {}), [METADATA_KEY]: next, music_multitrack_updated_at: new Date().toISOString() } });
  return next;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    const trackId = text(body.track_id);
    const clipId = text(body.clip_id);
    if (!organizationId) return NextResponse.json({ success:false, error:"organization_id required" }, { status:400 });
    if (!projectId || !trackId || !clipId) return NextResponse.json({ success:false, error:"creative_project_id, track_id and clip_id required" }, { status:400 });
    await requireAccess(request, organizationId);
    const project = await projectInScope(organizationId, projectId);
    const session = normalizedSession(project.metadata?.[METADATA_KEY]);
    const revision = assertRevision(session, body.expected_revision);
    const { clip } = selectClip(session, trackId, clipId);
    const action = text(body.action || "analyze").toLowerCase();

    if (action === "analyze") {
      const asset = await CreativeAssetsRuntime.get(clip.source_asset_id);
      if (!asset || String(asset.organization_id) !== String(organizationId)) throw new Error("CREATIVE_MUSIC_ELASTIC_SOURCE_ASSET_NOT_FOUND");
      const analysis = await analyzeMusicElasticAudio({
        organization_id: organizationId,
        source_url: asset.file_url,
        source_file_name: asset.file_name || `${asset.id}.wav`,
        source_mime_type: asset.metadata?.mime_type || null,
        source_asset_id: asset.id,
        source_offset_seconds: clip.source_offset_seconds,
        duration_seconds: clip.duration_seconds,
        sensitivity: body.sensitivity,
      });
      const plan = buildMusicElasticWarpPlan({ analysis, bpm: body.bpm || session.bpm, division: body.division || "1/16", strength: body.strength, max_shift_ms: body.max_shift_ms, grid_offset_seconds: body.grid_offset_seconds });
      const next = structuredClone(session);
      const target = selectClip(next, trackId, clipId).clip;
      target.elastic_audio = { analysis, warp_plan: plan, source_asset_id: clip.source_asset_id, source_offset_seconds: clip.source_offset_seconds, source_duration_seconds: clip.duration_seconds, render_asset_id: null, render_certified: false };
      next.revision = revision + 1;
      await persist(project, next);
      return NextResponse.json({ success:true, contract:"AVANTIQO_MUSIC_ELASTIC_AUDIO_API_V1", analysis, warp_plan:plan, revision:next.revision, render_performed:false, provider_job_submitted:false, endpoint_mutation_performed:false }, { headers:{"Cache-Control":"no-store"} });
    }

    if (action === "review_marker") {
      if (!clip.elastic_audio?.warp_plan) throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_PLAN_MISSING");
      const next = structuredClone(session);
      const target = selectClip(next, trackId, clipId).clip;
      target.elastic_audio.warp_plan = reviewMusicElasticWarpMarker(target.elastic_audio.warp_plan, text(body.marker_id), { approved: body.approved === true, target_seconds: body.target_seconds });
      next.revision = revision + 1;
      await persist(project, next);
      return NextResponse.json({ success:true, contract:"AVANTIQO_MUSIC_ELASTIC_AUDIO_REVIEW_V1", warp_plan:target.elastic_audio.warp_plan, revision:next.revision, render_performed:false, provider_job_submitted:false }, { headers:{"Cache-Control":"no-store"} });
    }

    if (action === "clear") {
      const next = structuredClone(session);
      const target = selectClip(next, trackId, clipId).clip;
      delete target.elastic_audio;
      next.revision = revision + 1;
      await persist(project, next);
      return NextResponse.json({ success:true, contract:"AVANTIQO_MUSIC_ELASTIC_AUDIO_CLEAR_V1", revision:next.revision, original_source_preserved:true, provider_job_submitted:false }, { headers:{"Cache-Control":"no-store"} });
    }

    return NextResponse.json({ success:false, error:"CREATIVE_MUSIC_ELASTIC_ACTION_INVALID" }, { status:400 });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Music elastic audio failed", provider_job_submitted:false, endpoint_mutation_performed:false }, { status:error?.status || 400 });
  }
}
