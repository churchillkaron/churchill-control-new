export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { validateMusicClipEdit } from "@/lib/creative/music/runtime/CreativeMusicClipEditRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { approveMusicVocalTuningSegment, buildMusicVocalTuningPlan } from "@/lib/creative/music/runtime/CreativeMusicVocalTuningPlanRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_multitrack_project";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_VOCAL_TUNING_PLAN_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_PROJECT_NOT_FOUND");
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
    const error = new Error(`CREATIVE_MUSIC_VOCAL_TUNING_PLAN_REVISION_CONFLICT:expected=${expected}:current=${current}`);
    error.status = 409;
    throw error;
  }
  return current;
}

function selectedVocalClip(session, trackId, clipId) {
  const track = session.tracks?.find((entry) => entry.id === trackId);
  const clip = track?.clips?.find((entry) => entry.id === clipId);
  if (!track || !clip) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_CLIP_NOT_FOUND");
  if (track.type !== "vocal") throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_VOCAL_TRACK_REQUIRED");
  return { track, clip };
}

function pitchAnalysisCurrent(clip) {
  const analysis = clip?.vocal_pitch_analysis;
  if (!analysis || analysis.contract !== "AVANTIQO_MUSIC_VOCAL_PITCH_ANALYSIS_V1") return false;
  return analysis.source_asset_id === clip.source_asset_id
    && Math.abs(finite(analysis.source_offset_seconds, -1) - finite(clip.source_offset_seconds, 0)) <= 0.001
    && Math.abs(finite(analysis.source_duration_seconds, -1) - finite(clip.duration_seconds, 0)) <= 0.01;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = text(body.action || "build").toLowerCase();
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
    if (!pitchAnalysisCurrent(clip)) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_CURRENT_PITCH_ANALYSIS_REQUIRED");
    if (!session.musical_key?.key || !session.musical_key?.mode) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_PROJECT_KEY_REQUIRED");

    const next = structuredClone(session);
    const nextTrack = next.tracks.find((entry) => entry.id === trackId);
    const nextClip = nextTrack.clips.find((entry) => entry.id === clipId);

    if (action === "build") {
      nextClip.vocal_tuning_plan = {
        ...buildMusicVocalTuningPlan({
          pitch_analysis: clip.vocal_pitch_analysis,
          musical_key: session.musical_key,
          correction_strength: body.settings?.correction_strength,
          preserve_within_cents: body.settings?.preserve_within_cents,
          max_correction_cents: body.settings?.max_correction_cents,
          minimum_segment_confidence: body.settings?.minimum_segment_confidence,
        }),
        source_asset_id: clip.source_asset_id,
        source_offset_seconds: clip.source_offset_seconds,
        source_duration_seconds: clip.duration_seconds,
        source_project_revision: revision,
        created_at: new Date().toISOString(),
      };
    } else if (action === "approve_segment") {
      const plan = clip.vocal_tuning_plan;
      if (!plan || plan.source_asset_id !== clip.source_asset_id) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_CURRENT_PLAN_REQUIRED");
      nextClip.vocal_tuning_plan = {
        ...approveMusicVocalTuningSegment(plan, text(body.segment_id), {
          approved: body.approved !== false,
          target_midi: body.target_midi,
        }),
        updated_at: new Date().toISOString(),
      };
    } else {
      return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_VOCAL_TUNING_PLAN_ACTION_INVALID" }, { status: 400 });
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
      contract: "AVANTIQO_MUSIC_VOCAL_TUNING_PLAN_RESPONSE_V1",
      action,
      plan: nextClip.vocal_tuning_plan,
      revision: next.revision,
      audio_changed: false,
      correction_applied: false,
      render_ready: false,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Music vocal tuning plan failed",
      audio_changed: false,
      correction_applied: false,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: error?.status || 400 });
  }
}
