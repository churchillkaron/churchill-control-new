export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { createMusicMidiControlEvent, ensureMusicMidiProject, validateMusicMidiProject } from "@/lib/creative/music/runtime/CreativeMusicMidiRuntime";
import { createMusicMultitrackProject, validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const METADATA_KEY = "music_multitrack_project";
const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_MIDI_CONTROL_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) { const error = new Error("CREATIVE_MUSIC_MIDI_CONTROL_PROJECT_NOT_FOUND"); error.status = 404; throw error; }
  return project;
}

function defaultSession(project) {
  return createMusicMultitrackProject({ id: `music-multitrack-${project.id}`, title: project.name || project.title || "Music Project", bpm: project.metadata?.music_bpm || 96, time_signature: project.metadata?.music_time_signature || "4/4", sample_rate: 48000 });
}

function normalizeSession(session) {
  const next = ensureMusicEngineeringBuses(session);
  validateMusicMultitrackProject(next); validateMusicMixerRouting(next); validateMusicGroupProcessing(next); validateMusicAutomation(next);
  next.midi = ensureMusicMidiProject(next.midi || {}); validateMusicMidiProject(next.midi);
  return next;
}

function selectClip(session, trackId, clipId) {
  const track = session.midi.tracks.find((entry) => entry.id === trackId);
  const clip = track?.clips?.find((entry) => entry.id === clipId);
  if (!track || !clip) throw new Error("CREATIVE_MUSIC_MIDI_CONTROL_CLIP_NOT_FOUND");
  return { track, clip };
}

async function persist(project, session) {
  const next = normalizeSession(session);
  next.revision = Math.max(0, Math.round(finite(next.revision, 0))) + 1;
  await CreativeProjectRepository.update(project.id, { metadata: { ...(project.metadata || {}), [METADATA_KEY]: next, music_bpm: next.bpm, music_time_signature: next.time_signature, music_multitrack_updated_at: new Date().toISOString(), music_midi_updated_at: new Date().toISOString(), music_midi_control_updated_at: new Date().toISOString() } });
  return next;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const project = await projectInScope(organizationId, projectId);
    const session = normalizeSession(project.metadata?.[METADATA_KEY] || defaultSession(project));
    const action = text(body.action || "list").toLowerCase();
    const trackId = text(body.track_id);
    const clipId = text(body.clip_id);
    if (action === "list") {
      const { clip } = selectClip(session, trackId, clipId);
      return NextResponse.json({ success: true, contract: "AVANTIQO_MUSIC_MIDI_CONTROL_API_V1", revision: session.revision || 0, events: clip.control_events || [], provider_job_submitted: false, endpoint_mutation_performed: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const revision = Math.max(0, Math.round(finite(session.revision, 0)));
    const expected = Math.max(0, Math.round(finite(body.expected_revision, -1)));
    if (revision !== expected) { const error = new Error(`CREATIVE_MUSIC_MIDI_CONTROL_REVISION_CONFLICT:expected=${expected}:current=${revision}`); error.status = 409; throw error; }
    const next = structuredClone(session);
    const { clip } = selectClip(next, trackId, clipId);
    if (action === "add") {
      clip.control_events.push(createMusicMidiControlEvent(body.event || {}));
    } else if (action === "update") {
      const index = clip.control_events.findIndex((event) => event.id === text(body.event_id));
      if (index < 0) throw new Error("CREATIVE_MUSIC_MIDI_CONTROL_EVENT_NOT_FOUND");
      clip.control_events[index] = createMusicMidiControlEvent({ ...clip.control_events[index], ...(body.event || {}), id: clip.control_events[index].id });
    } else if (action === "delete") {
      const before = clip.control_events.length;
      clip.control_events = clip.control_events.filter((event) => event.id !== text(body.event_id));
      if (clip.control_events.length === before) throw new Error("CREATIVE_MUSIC_MIDI_CONTROL_EVENT_NOT_FOUND");
    } else if (action === "replace_lane") {
      const type = text(body.type).toLowerCase();
      const controller = body.controller === null || body.controller === undefined ? null : Math.round(finite(body.controller, 0));
      const points = Array.isArray(body.points) ? body.points : [];
      if (points.length > 4096) throw new Error("CREATIVE_MUSIC_MIDI_CONTROL_POINT_LIMIT_EXCEEDED");
      clip.control_events = (clip.control_events || []).filter((event) => !(event.type === type && (type !== "control_change" || event.controller === controller)));
      for (const point of points) clip.control_events.push(createMusicMidiControlEvent({ type, controller, beat: point.beat, value: point.value }));
    } else {
      throw new Error("CREATIVE_MUSIC_MIDI_CONTROL_ACTION_INVALID");
    }
    clip.control_events.sort((a, b) => a.beat - b.beat || a.type.localeCompare(b.type));
    validateMusicMidiProject(next.midi);
    const saved = await persist(project, { ...next, revision });
    const savedClip = saved.midi.tracks.find((entry) => entry.id === trackId)?.clips.find((entry) => entry.id === clipId);
    return NextResponse.json({ success: true, contract: "AVANTIQO_MUSIC_MIDI_CONTROL_API_V1", action, revision: saved.revision, events: savedClip?.control_events || [], original_performance_preserved: true, provider_job_submitted: false, endpoint_mutation_performed: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Music MIDI control automation failed", provider_job_submitted: false, endpoint_mutation_performed: false }, { status: error?.status || 400 });
  }
}
