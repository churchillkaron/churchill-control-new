export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  createMusicMidiClip,
  createMusicMidiControlEvent,
  createMusicMidiNote,
  createMusicMidiTrack,
  ensureMusicMidiProject,
  validateMusicMidiProject,
} from "@/lib/creative/music/runtime/CreativeMusicMidiRuntime";
import { createMusicMultitrackProject, validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const KEY = "music_multitrack_project";
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_MIDI_FILE_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}
async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) { const error = new Error("CREATIVE_MUSIC_MIDI_FILE_PROJECT_NOT_FOUND"); error.status = 404; throw error; }
  return project;
}
function defaultSession(project) {
  return createMusicMultitrackProject({ id:`music-multitrack-${project.id}`, title:project.name || project.title || "Music Project", bpm:project.metadata?.music_bpm || 96, time_signature:project.metadata?.music_time_signature || "4/4", sample_rate:48000 });
}
function validParsed(value) {
  return value?.contract === "AVANTIQO_MUSIC_STANDARD_MIDI_FILE_V1" && Array.isArray(value.tracks) && value.tracks.length <= 128;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({success:false,error:"organization_id required"},{status:400});
    await requireAccess(request, organizationId);
    const project = await projectInScope(organizationId, projectId);
    const current = structuredClone(project.metadata?.[KEY] || defaultSession(project));
    current.midi = ensureMusicMidiProject(current.midi || {});
    validateMusicMultitrackProject(current); validateMusicMidiProject(current.midi);
    const expected = Math.max(0, Math.round(finite(body.expected_revision, -1)));
    const revision = Math.max(0, Math.round(finite(current.revision, 0)));
    if (expected !== revision) { const error = new Error(`CREATIVE_MUSIC_MIDI_FILE_REVISION_CONFLICT:expected=${expected}:current=${revision}`); error.status = 409; throw error; }
    const action = text(body.action || "import_parsed").toLowerCase();
    if (action !== "import_parsed") throw new Error("CREATIVE_MUSIC_MIDI_FILE_ACTION_INVALID");
    const parsed = body.parsed;
    if (!validParsed(parsed)) throw new Error("CREATIVE_MUSIC_MIDI_FILE_PARSED_CONTRACT_INVALID");
    const replace = body.replace_existing === true;
    const importedTracks = parsed.tracks.map((source, index) => {
      const track = createMusicMidiTrack({ name:text(source.name || `Imported MIDI ${index + 1}`), midi_channel:source.midi_channel || 1, instrument:{ kind:"unassigned", instrument_id:null, preset_id:null } });
      const clip = createMusicMidiClip({ name:text(source.name || `Imported MIDI ${index + 1}`), start_beat:Math.max(0, finite(source.start_beat, 0)), duration_beats:Math.max(0.03125, finite(source.duration_beats, 4)) });
      clip.notes = (source.notes || []).slice(0,100000).map((note) => createMusicMidiNote(note));
      clip.control_events = (source.control_events || []).slice(0,50000).map((event) => createMusicMidiControlEvent(event));
      clip.original_performance = { notes:structuredClone(clip.notes), control_events:structuredClone(clip.control_events), immutable:true, captured_at:new Date().toISOString(), source:"STANDARD_MIDI_FILE_IMPORT" };
      track.clips.push(clip);
      return track;
    });
    current.midi.ppq = Math.max(96, Math.min(3840, Math.round(finite(parsed.ppq, current.midi.ppq || 960))));
    current.midi.tracks = replace ? importedTracks : [...current.midi.tracks, ...importedTracks].slice(0,128);
    const firstTempo = parsed.tempo_events?.[0]?.bpm;
    if (body.apply_first_tempo === true && Number.isFinite(Number(firstTempo))) current.bpm = Math.max(30, Math.min(300, Math.round(Number(firstTempo))));
    const firstSignature = parsed.time_signatures?.[0];
    if (body.apply_first_time_signature === true && firstSignature) {
      const signature = `${firstSignature.numerator}/${firstSignature.denominator}`;
      if (["2/4","3/4","4/4","6/8"].includes(signature)) current.time_signature = signature;
    }
    current.revision = revision + 1;
    validateMusicMultitrackProject(current); validateMusicMidiProject(current.midi);
    const metadata = { ...(project.metadata || {}), [KEY]:current, music_bpm:current.bpm, music_time_signature:current.time_signature, music_midi_updated_at:new Date().toISOString(), music_multitrack_updated_at:new Date().toISOString() };
    await CreativeProjectRepository.update(project.id, { metadata });
    return NextResponse.json({ success:true, contract:"AVANTIQO_MUSIC_STANDARD_MIDI_IMPORT_API_V1", revision:current.revision, imported_track_count:importedTracks.length, replace_existing:replace, source_ppq:parsed.ppq, provider_job_submitted:false, endpoint_mutation_performed:false }, {headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return NextResponse.json({success:false,error:error?.message || "MIDI file import failed",provider_job_submitted:false,endpoint_mutation_performed:false},{status:error?.status || 400});
  }
}
