export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import {
  createMusicMidiDrumPattern,
  musicMidiDrumPatternToNotes,
  normalizeMusicMidiDrumPattern,
  toggleMusicMidiDrumHit,
} from "@/lib/creative/music/runtime/CreativeMusicMidiDrumRuntime";
import {
  createMusicMidiClip,
  createMusicMidiNote,
  createMusicMidiTrack,
  ensureMusicMidiProject,
  validateMusicMidiProject,
} from "@/lib/creative/music/runtime/CreativeMusicMidiRuntime";
import { createMusicMultitrackProject, validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const METADATA_KEY = "music_multitrack_project";
const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_MIDI_DRUM_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) { const error = new Error("CREATIVE_MUSIC_MIDI_DRUM_PROJECT_NOT_FOUND"); error.status = 404; throw error; }
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

function ensureDrumTrack(session) {
  let track = session.midi.tracks.find((entry) => entry.instrument?.kind === "drum_machine");
  if (!track) {
    track = createMusicMidiTrack({ name: "Drum Machine", midi_channel: 10, instrument: { kind: "drum_machine", instrument_id: "avantiqo-browser-drums-v1" } });
    session.midi.tracks.push(track);
  }
  let clip = track.clips.find((entry) => entry.drum_pattern?.contract === "AVANTIQO_MUSIC_MIDI_DRUM_PATTERN_V1");
  if (!clip) {
    clip = createMusicMidiClip({ name: "Drum Pattern", start_beat: 0, duration_beats: 4 });
    clip.drum_pattern = createMusicMidiDrumPattern({ steps: 16, bars: 1, beats_per_bar: 4 });
    clip.original_performance = { notes: [], control_events: [], immutable: true, captured_at: null };
    track.clips.push(clip);
  }
  return { track, clip };
}

function renderPatternIntoClip(clip) {
  clip.drum_pattern = normalizeMusicMidiDrumPattern(clip.drum_pattern);
  const rawNotes = musicMidiDrumPatternToNotes(clip.drum_pattern);
  clip.notes = rawNotes.map((note) => createMusicMidiNote(note));
  clip.duration_beats = clip.drum_pattern.bars * clip.drum_pattern.beats_per_bar;
  clip.original_performance = {
    notes: structuredClone(clip.notes),
    control_events: [],
    immutable: true,
    captured_at: new Date().toISOString(),
    source: "MIDI_STEP_SEQUENCER",
  };
}

async function persist(project, session) {
  const next = normalizeSession(session);
  next.revision = Math.max(0, Math.round(finite(next.revision, 0))) + 1;
  await CreativeProjectRepository.update(project.id, { metadata: { ...(project.metadata || {}), [METADATA_KEY]: next, music_bpm: next.bpm, music_time_signature: next.time_signature, music_multitrack_updated_at: new Date().toISOString(), music_midi_updated_at: new Date().toISOString() } });
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
    const action = text(body.action || "load").toLowerCase();
    if (action === "load") {
      const { track, clip } = ensureDrumTrack(session);
      return NextResponse.json({ success: true, contract: "AVANTIQO_MUSIC_MIDI_DRUM_API_V1", session, track_id: track.id, clip_id: clip.id, pattern: clip.drum_pattern, revision: session.revision || 0, provider_job_submitted: false, endpoint_mutation_performed: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const revision = Math.max(0, Math.round(finite(session.revision, 0)));
    const expected = Math.max(0, Math.round(finite(body.expected_revision, -1)));
    if (revision !== expected) { const error = new Error(`CREATIVE_MUSIC_MIDI_DRUM_REVISION_CONFLICT:expected=${expected}:current=${revision}`); error.status = 409; throw error; }
    const next = structuredClone(session);
    const { track, clip } = ensureDrumTrack(next);
    if (action === "toggle_hit") {
      clip.drum_pattern = toggleMusicMidiDrumHit(clip.drum_pattern, { lane_id: body.lane_id, step: body.step, velocity: body.velocity });
    } else if (action === "settings") {
      clip.drum_pattern = normalizeMusicMidiDrumPattern({ ...clip.drum_pattern, ...(body.settings || {}) });
    } else if (action === "clear") {
      clip.drum_pattern = normalizeMusicMidiDrumPattern({ ...clip.drum_pattern, hits: [] });
    } else {
      throw new Error("CREATIVE_MUSIC_MIDI_DRUM_ACTION_INVALID");
    }
    renderPatternIntoClip(clip);
    validateMusicMidiProject(next.midi);
    const saved = await persist(project, { ...next, revision });
    const savedTrack = saved.midi.tracks.find((entry) => entry.id === track.id);
    const savedClip = savedTrack?.clips.find((entry) => entry.id === clip.id);
    return NextResponse.json({ success: true, contract: "AVANTIQO_MUSIC_MIDI_DRUM_API_V1", session: saved, track_id: track.id, clip_id: clip.id, pattern: savedClip?.drum_pattern || null, revision: saved.revision, midi_notes_updated: true, provider_job_submitted: false, endpoint_mutation_performed: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Music MIDI drums failed", provider_job_submitted: false, endpoint_mutation_performed: false }, { status: error?.status || 400 });
  }
}
