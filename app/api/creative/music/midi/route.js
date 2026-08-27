export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import {
  captureMusicMidiOriginalPerformance,
  createMusicMidiClip,
  createMusicMidiControlEvent,
  createMusicMidiNote,
  createMusicMidiTrack,
  ensureMusicMidiProject,
  quantizeMusicMidiClip,
  restoreMusicMidiOriginalPerformance,
  transposeMusicMidiClip,
  validateMusicMidiProject,
} from "@/lib/creative/music/runtime/CreativeMusicMidiRuntime";
import { createMusicMultitrackProject, validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_multitrack_project";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_MIDI_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_MIDI_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

function defaultSession(project) {
  return createMusicMultitrackProject({
    id: `music-multitrack-${project.id}`,
    title: project.name || project.title || "Music Project",
    bpm: project.metadata?.music_bpm || 96,
    time_signature: project.metadata?.music_time_signature || "4/4",
    sample_rate: 48000,
  });
}

function normalizeSession(session) {
  const next = ensureMusicEngineeringBuses(session);
  validateMusicMultitrackProject(next);
  validateMusicMixerRouting(next);
  validateMusicGroupProcessing(next);
  validateMusicAutomation(next);
  next.midi = ensureMusicMidiProject(next.midi || {});
  validateMusicMidiProject(next.midi);
  return next;
}

function selectMidiTrack(session, trackId) {
  const track = session.midi?.tracks?.find((entry) => entry.id === trackId);
  if (!track) throw new Error("CREATIVE_MUSIC_MIDI_TRACK_NOT_FOUND");
  return track;
}

function selectMidiClip(session, trackId, clipId) {
  const track = selectMidiTrack(session, trackId);
  const clip = track.clips?.find((entry) => entry.id === clipId);
  if (!clip) throw new Error("CREATIVE_MUSIC_MIDI_CLIP_NOT_FOUND");
  return { track, clip };
}

async function persist(project, session) {
  const next = normalizeSession(session);
  next.revision = Math.max(0, Math.round(finite(next.revision, 0))) + 1;
  await CreativeProjectRepository.update(project.id, {
    metadata: {
      ...(project.metadata || {}),
      [METADATA_KEY]: next,
      music_bpm: next.bpm,
      music_time_signature: next.time_signature,
      music_multitrack_updated_at: new Date().toISOString(),
      music_midi_updated_at: new Date().toISOString(),
    },
  });
  return next;
}

function publicResult(session, extra = {}) {
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_MIDI_PROJECT_API_V1",
    session,
    midi: session.midi,
    revision: Math.max(0, Math.round(finite(session.revision, 0))),
    audio_changed: false,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
    ...extra,
  };
}

function appendRecordedPerformance(clip, performance = {}) {
  if (clip.quantization || Math.abs(finite(clip.transpose_semitones, 0)) > 0) {
    throw new Error("CREATIVE_MUSIC_MIDI_RECORDING_RESTORE_ORIGINAL_REQUIRED");
  }
  const incomingNotes = Array.isArray(performance.notes) ? performance.notes : [];
  const incomingEvents = Array.isArray(performance.control_events) ? performance.control_events : [];
  if (!incomingNotes.length && !incomingEvents.length) throw new Error("CREATIVE_MUSIC_MIDI_RECORDED_PERFORMANCE_EMPTY");
  if (incomingNotes.length > 10000 || incomingEvents.length > 50000) throw new Error("CREATIVE_MUSIC_MIDI_RECORDED_PERFORMANCE_LIMIT_EXCEEDED");
  const notes = incomingNotes.map((note) => createMusicMidiNote(note));
  const events = incomingEvents.map((event) => createMusicMidiControlEvent(event));
  clip.notes = [...(clip.notes || []), ...notes].sort((a, b) => a.start_beat - b.start_beat || a.pitch - b.pitch);
  clip.control_events = [...(clip.control_events || []), ...events].sort((a, b) => a.beat - b.beat);
  clip.original_performance = {
    notes: structuredClone(clip.notes),
    control_events: structuredClone(clip.control_events),
    immutable: true,
    captured_at: new Date().toISOString(),
    source: "WEB_MIDI_INPUT",
  };
  clip.last_recording = {
    contract: "AVANTIQO_MUSIC_WEB_MIDI_RECORDING_V1",
    note_count: notes.length,
    control_event_count: events.length,
    input_device_id: text(performance.input_device_id) || null,
    input_device_name: text(performance.input_device_name) || null,
    midi_channel: Math.max(1, Math.min(16, Math.round(finite(performance.midi_channel, 1)))),
    started_at: text(performance.started_at) || null,
    stopped_at: text(performance.stopped_at) || new Date().toISOString(),
    raw_timing_preserved: true,
    raw_velocity_preserved: true,
    provider_job_submitted: false,
  };
  return { noteCount: notes.length, controlEventCount: events.length };
}

async function mutate(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const project = await projectInScope(organizationId, projectId);
  const session = normalizeSession(project.metadata?.[METADATA_KEY] || defaultSession(project));
  const revision = Math.max(0, Math.round(finite(session.revision, 0)));
  const expected = Math.max(0, Math.round(finite(body.expected_revision, -1)));
  if (revision !== expected) {
    const error = new Error(`CREATIVE_MUSIC_MIDI_REVISION_CONFLICT:expected=${expected}:current=${revision}`);
    error.status = 409;
    throw error;
  }
  const next = structuredClone(session);
  const action = text(body.action).toLowerCase();
  let mutationEvidence = {};

  if (action === "add_track") {
    next.midi.tracks.push(createMusicMidiTrack(body.track || {}));
  } else if (action === "add_clip") {
    const track = selectMidiTrack(next, text(body.track_id));
    const clip = createMusicMidiClip(body.clip || {});
    clip.original_performance = { notes: [], control_events: [], immutable: true, captured_at: null };
    track.clips.push(clip);
  } else if (action === "add_note") {
    const { clip } = selectMidiClip(next, text(body.track_id), text(body.clip_id));
    clip.notes.push(createMusicMidiNote(body.note || {}));
  } else if (action === "update_note") {
    const { clip } = selectMidiClip(next, text(body.track_id), text(body.clip_id));
    const index = clip.notes.findIndex((note) => note.id === text(body.note_id));
    if (index < 0) throw new Error("CREATIVE_MUSIC_MIDI_NOTE_NOT_FOUND");
    clip.notes[index] = createMusicMidiNote({ ...clip.notes[index], ...(body.note || {}), id: clip.notes[index].id });
  } else if (action === "delete_note") {
    const { clip } = selectMidiClip(next, text(body.track_id), text(body.clip_id));
    const before = clip.notes.length;
    clip.notes = clip.notes.filter((note) => note.id !== text(body.note_id));
    if (clip.notes.length === before) throw new Error("CREATIVE_MUSIC_MIDI_NOTE_NOT_FOUND");
  } else if (action === "add_control_event") {
    const { clip } = selectMidiClip(next, text(body.track_id), text(body.clip_id));
    clip.control_events.push(createMusicMidiControlEvent(body.event || {}));
    clip.control_events.sort((a, b) => a.beat - b.beat);
  } else if (action === "record_performance") {
    const { clip } = selectMidiClip(next, text(body.track_id), text(body.clip_id));
    const recorded = appendRecordedPerformance(clip, body.performance || {});
    mutationEvidence = {
      web_midi_recording: true,
      recorded_note_count: recorded.noteCount,
      recorded_control_event_count: recorded.controlEventCount,
      raw_timing_preserved: true,
      raw_velocity_preserved: true,
    };
  } else if (action === "capture_original") {
    const selected = selectMidiClip(next, text(body.track_id), text(body.clip_id));
    const captured = captureMusicMidiOriginalPerformance(selected.clip);
    selected.track.clips = selected.track.clips.map((clip) => clip.id === captured.id ? captured : clip);
  } else if (action === "quantize") {
    const selected = selectMidiClip(next, text(body.track_id), text(body.clip_id));
    const captured = captureMusicMidiOriginalPerformance(selected.clip);
    const quantized = quantizeMusicMidiClip(captured, body.quantize || {});
    selected.track.clips = selected.track.clips.map((clip) => clip.id === quantized.id ? quantized : clip);
  } else if (action === "transpose") {
    const selected = selectMidiClip(next, text(body.track_id), text(body.clip_id));
    const captured = captureMusicMidiOriginalPerformance(selected.clip);
    const transposed = transposeMusicMidiClip(captured, finite(body.semitones, 0));
    selected.track.clips = selected.track.clips.map((clip) => clip.id === transposed.id ? transposed : clip);
  } else if (action === "restore_original") {
    const selected = selectMidiClip(next, text(body.track_id), text(body.clip_id));
    const restored = restoreMusicMidiOriginalPerformance(selected.clip);
    selected.track.clips = selected.track.clips.map((clip) => clip.id === restored.id ? restored : clip);
  } else if (action === "update_input") {
    next.midi.input = {
      ...next.midi.input,
      ...(body.input || {}),
      input_channel: Math.max(1, Math.min(16, Math.round(finite(body.input?.input_channel, next.midi.input?.input_channel || 1)))),
    };
  } else {
    throw new Error("CREATIVE_MUSIC_MIDI_ACTION_INVALID");
  }

  validateMusicMidiProject(next.midi);
  const saved = await persist(project, { ...next, revision });
  return publicResult(saved, { action, ...mutationEvidence });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "load").toLowerCase();
    if (action === "load") {
      const project = await projectInScope(organizationId, projectId);
      const saved = Boolean(project.metadata?.[METADATA_KEY]);
      const session = normalizeSession(project.metadata?.[METADATA_KEY] || defaultSession(project));
      return NextResponse.json(publicResult(session, { persisted: saved }), { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    const result = await mutate({ ...body, action });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Creative Music MIDI failed", provider_job_submitted: false, endpoint_mutation_performed: false }, { status: error?.status || 400 });
  }
}
