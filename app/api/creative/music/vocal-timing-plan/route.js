export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { validateMusicClipEdit } from "@/lib/creative/music/runtime/CreativeMusicClipEditRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { analyzeMusicVocalTiming } from "@/lib/creative/music/runtime/CreativeMusicVocalTimingAnalysisRuntime";
import { buildMusicVocalTimingPlan, reviewMusicVocalTimingPhrase } from "@/lib/creative/music/runtime/CreativeMusicVocalTimingPlanRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_multitrack_project";
const ANALYSIS_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_ANALYSIS_V1";
const PLAN_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_V1";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_VOCAL_TIMING_PLAN_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_PROJECT_NOT_FOUND");
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

function assertRevision(session, expectedRevision) {
  const current = Math.max(0, Math.round(finite(session.revision, 0)));
  const expected = Math.max(0, Math.round(finite(expectedRevision, -1)));
  if (current !== expected) {
    const error = new Error(`CREATIVE_MUSIC_VOCAL_TIMING_PLAN_REVISION_CONFLICT:expected=${expected}:current=${current}`);
    error.status = 409;
    throw error;
  }
  return current;
}

function selectedVocalClip(session, trackId, clipId) {
  const track = session.tracks?.find((entry) => entry.id === trackId);
  const clip = track?.clips?.find((entry) => entry.id === clipId);
  if (!track || !clip) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_CLIP_NOT_FOUND");
  if (track.type !== "vocal") throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_VOCAL_TRACK_REQUIRED");
  return { track, clip };
}

function assetProjectId(asset) {
  return text(asset?.creative_project_id || asset?.metadata?.creative_project_id);
}

async function sourceAssetInScope(organizationId, projectId, assetId) {
  const asset = await CreativeAssetsRuntime.get(assetId);
  if (!asset || String(asset.organization_id) !== String(organizationId) || assetProjectId(asset) !== String(projectId)) {
    throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_SOURCE_ASSET_NOT_FOUND");
  }
  return asset;
}

function analysisCurrent(analysis, clip) {
  return Boolean(analysis)
    && analysis.contract === ANALYSIS_CONTRACT
    && analysis.source_asset_id === clip.source_asset_id
    && Math.abs(finite(analysis.source_offset_seconds, -1) - finite(clip.source_offset_seconds, 0)) <= 0.001
    && Math.abs(finite(analysis.source_duration_seconds, -1) - finite(clip.duration_seconds, 0)) <= 0.01;
}

function planCurrent(plan, clip) {
  return Boolean(plan)
    && plan.contract === PLAN_CONTRACT
    && plan.source_asset_id === clip.source_asset_id
    && Math.abs(finite(plan.source_offset_seconds, -1) - finite(clip.source_offset_seconds, 0)) <= 0.001
    && Math.abs(finite(plan.source_duration_seconds, -1) - finite(clip.duration_seconds, 0)) <= 0.01;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = text(body.action || "analyze").toLowerCase();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    const trackId = text(body.track_id);
    const clipId = text(body.clip_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    if (!projectId || !trackId || !clipId) return NextResponse.json({ success: false, error: "creative_project_id, track_id and clip_id required" }, { status: 400 });
    await requireAccess(request, organizationId);

    const project = await projectInScope(organizationId, projectId);
    const session = normalizeSession(project.metadata?.[METADATA_KEY]);
    const revision = assertRevision(session, body.expected_revision);
    const { clip } = selectedVocalClip(session, trackId, clipId);
    const next = structuredClone(session);
    const nextClip = next.tracks.find((entry) => entry.id === trackId).clips.find((entry) => entry.id === clipId);

    if (action === "analyze") {
      const asset = await sourceAssetInScope(organizationId, projectId, clip.source_asset_id);
      const analysis = await analyzeMusicVocalTiming({
        organization_id: organizationId,
        source_url: asset.file_url,
        source_file_name: asset.file_name || `${asset.id}.wav`,
        source_mime_type: asset.metadata?.mime_type || null,
        source_offset_seconds: clip.source_offset_seconds,
        duration_seconds: clip.duration_seconds,
        bpm: session.bpm,
        beat_offset_seconds: body.settings?.beat_offset_seconds,
        correction_strength: body.settings?.correction_strength,
        max_shift_ms: body.settings?.max_shift_ms,
      });
      nextClip.vocal_timing_analysis = {
        ...analysis,
        source_asset_id: clip.source_asset_id,
        source_offset_seconds: clip.source_offset_seconds,
        source_duration_seconds: clip.duration_seconds,
        source_project_revision: revision,
        analyzed_at: new Date().toISOString(),
      };
      nextClip.vocal_timing_plan = null;
    } else if (action === "build") {
      if (!analysisCurrent(clip.vocal_timing_analysis, clip)) {
        throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_CURRENT_ANALYSIS_REQUIRED");
      }
      nextClip.vocal_timing_plan = {
        ...buildMusicVocalTimingPlan({ analysis: clip.vocal_timing_analysis }),
        source_asset_id: clip.source_asset_id,
        source_offset_seconds: clip.source_offset_seconds,
        source_duration_seconds: clip.duration_seconds,
        source_project_revision: revision,
        created_at: new Date().toISOString(),
      };
    } else if (action === "review_phrase") {
      if (!planCurrent(clip.vocal_timing_plan, clip)) {
        throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_CURRENT_PLAN_REQUIRED");
      }
      nextClip.vocal_timing_plan = {
        ...reviewMusicVocalTimingPhrase(clip.vocal_timing_plan, text(body.phrase_id), {
          approved: body.approved !== false,
          shift_ms: body.shift_ms,
        }),
        updated_at: new Date().toISOString(),
      };
    } else {
      return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_VOCAL_TIMING_PLAN_ACTION_INVALID" }, { status: 400 });
    }

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
      contract: "AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_RESPONSE_V1",
      action,
      analysis: nextClip.vocal_timing_analysis || null,
      plan: nextClip.vocal_timing_plan || null,
      revision: next.revision,
      audio_changed: false,
      timing_applied: false,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Music vocal timing plan failed",
      audio_changed: false,
      timing_applied: false,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: error?.status || 400 });
  }
}
