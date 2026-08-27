export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { buildMusicMidiProgression, musicMidiScale, snapMidiPitchToScale } from "@/lib/creative/music/runtime/CreativeMusicMidiHarmonyRuntime";
import { createMusicMidiNote, ensureMusicMidiProject, validateMusicMidiProject } from "@/lib/creative/music/runtime/CreativeMusicMidiRuntime";
import { createMusicMultitrackProject, validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const METADATA_KEY = "music_multitrack_project";
const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_MIDI_HARMONY_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) { const error = new Error("CREATIVE_MUSIC_MIDI_HARMONY_PROJECT_NOT_FOUND"); error.status = 404; throw error; }
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
  if (!track || !clip) throw new Error("CREATIVE_MUSIC_MIDI_HARMONY_CLIP_NOT_FOUND");
  if (track.midi_channel === 10 || track.instrument?.kind === "drum_machine") throw new Error("CREATIVE_MUSIC_MIDI_HARMONY_MELODIC_TRACK_REQUIRED");
  return { track, clip };
}

async function persist(project, session) {
  const next = normalizeSession(session);
  next.revision = Math.max(0, Math.round(finite(next.revision, 0))) + 1;
  await CreativeProjectRepository.update(project.id, { metadata: { ...(project.metadata || {}), [METADATA_KEY]: next, music_bpm: next.bpm, music_time_signature: next.time_signature, music_multitrack_updated_at: new Date().toISOString(), music_midi_updated_at: new Date().toISOString(), music_midi_harmony_updated_at: new Date().toISOString() } });
  return next;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({ success:false, error:"organization_id required" }, { status:400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "preview_progression").toLowerCase();
    const harmony = body.harmony || {};
    if (action === "scale") {
      return NextResponse.json({ success:true, contract:"AVANTIQO_MUSIC_MIDI_HARMONY_API_V1", scale:musicMidiScale(harmony), provider_job_submitted:false, endpoint_mutation_performed:false }, { headers:{"Cache-Control":"no-store"} });
    }
    if (action === "preview_progression") {
      return NextResponse.json({ success:true, contract:"AVANTIQO_MUSIC_MIDI_HARMONY_API_V1", progression:buildMusicMidiProgression(harmony), provider_job_submitted:false, endpoint_mutation_performed:false }, { headers:{"Cache-Control":"no-store"} });
    }

    const project = await projectInScope(organizationId, projectId);
    const session = normalizeSession(project.metadata?.[METADATA_KEY] || defaultSession(project));
    const revision = Math.max(0,Math.round(finite(session.revision,0)));
    const expected = Math.max(0,Math.round(finite(body.expected_revision,-1)));
    if (revision !== expected) { const error = new Error(`CREATIVE_MUSIC_MIDI_HARMONY_REVISION_CONFLICT:expected=${expected}:current=${revision}`); error.status=409; throw error; }
    const next = structuredClone(session);

    if (action === "set_scale_lock") {
      const scale = musicMidiScale(harmony);
      next.midi.editor = { ...(next.midi.editor || {}), scale_lock: { root:scale.root, mode:scale.mode, pitch_classes:scale.pitch_classes, enabled:body.enabled !== false } };
    } else if (action === "snap_clip_to_scale") {
      const { clip } = selectClip(next,text(body.track_id),text(body.clip_id));
      const scale = musicMidiScale(harmony);
      clip.notes = (clip.notes || []).map((note) => createMusicMidiNote({ ...note, pitch:snapMidiPitchToScale(note.pitch,scale), id:note.id }));
      clip.scale_snap = { root:scale.root, mode:scale.mode, applied_at:new Date().toISOString(), reversible_from_original_performance:true };
    } else if (action === "insert_progression") {
      const { clip } = selectClip(next,text(body.track_id),text(body.clip_id));
      const progression = buildMusicMidiProgression(harmony);
      const insertedIds = [];
      for (const chord of progression.chords) {
        for (const pitch of chord.pitches) {
          const note = createMusicMidiNote({ pitch, start_beat:chord.start_beat, duration_beats:chord.duration_beats, velocity:chord.velocity });
          insertedIds.push(note.id);
          clip.notes.push(note);
        }
      }
      clip.notes.sort((a,b) => a.start_beat-b.start_beat || a.pitch-b.pitch);
      clip.harmony_insertions = [
        ...(Array.isArray(clip.harmony_insertions) ? clip.harmony_insertions : []),
        { contract:"AVANTIQO_MUSIC_MIDI_HARMONY_INSERTION_V1", note_ids:insertedIds, degrees:progression.degrees, root:progression.chords[0]?.scale?.root || null, mode:progression.chords[0]?.scale?.mode || null, start_beat:progression.start_beat, duration_beats:progression.duration_beats, editable_midi:true, inserted_at:new Date().toISOString() },
      ];
    } else {
      throw new Error("CREATIVE_MUSIC_MIDI_HARMONY_ACTION_INVALID");
    }

    validateMusicMidiProject(next.midi);
    const saved = await persist(project,{...next,revision});
    return NextResponse.json({ success:true, contract:"AVANTIQO_MUSIC_MIDI_HARMONY_API_V1", action, session:saved, revision:saved.revision, editable_midi:true, audio_changed:false, provider_job_submitted:false, endpoint_mutation_performed:false }, { headers:{"Cache-Control":"no-store"} });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Music MIDI harmony failed", provider_job_submitted:false, endpoint_mutation_performed:false }, { status:error?.status || 400 });
  }
}
