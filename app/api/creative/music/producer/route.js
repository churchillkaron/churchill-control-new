export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { buildMusicArrangementTemplate, ensureMusicArrangement, validateMusicArrangement } from "@/lib/creative/music/runtime/CreativeMusicArrangementRuntime";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { createMusicMidiClip, createMusicMidiTrack, ensureMusicMidiProject, validateMusicMidiProject } from "@/lib/creative/music/runtime/CreativeMusicMidiRuntime";
import { createMusicMidiDrumPattern } from "@/lib/creative/music/runtime/CreativeMusicMidiDrumRuntime";
import { createMusicMultitrackProject, validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { analyzeMusicProducerProject, createMusicProducerSnapshot, validateMusicProducerSnapshot } from "@/lib/creative/music/runtime/CreativeMusicProducerRuntime";
import { ensureMusicSamplerProject, validateMusicSamplerProject } from "@/lib/creative/music/runtime/CreativeMusicSamplerRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const MULTITRACK_KEY = "music_multitrack_project";
const ARRANGEMENT_KEY = "music_arrangement";
const SAMPLER_KEY = "music_sampler_project";
const HISTORY_KEY = "music_producer_history";
const MAX_HISTORY = 12;
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_PRODUCER_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) { const error = new Error("CREATIVE_MUSIC_PRODUCER_PROJECT_NOT_FOUND"); error.status = 404; throw error; }
  return project;
}

function defaultSession(project) {
  return createMusicMultitrackProject({ id:`music-multitrack-${project.id}`, title:project.name || project.title || "Music Project", bpm:project.metadata?.music_bpm || 96, time_signature:project.metadata?.music_time_signature || "4/4", sample_rate:48000 });
}

function normalizeSession(session) {
  const next = ensureMusicEngineeringBuses(session);
  validateMusicMultitrackProject(next); validateMusicMixerRouting(next); validateMusicGroupProcessing(next); validateMusicAutomation(next);
  next.midi = ensureMusicMidiProject(next.midi || {}); validateMusicMidiProject(next.midi);
  return next;
}

function projectState(project) {
  const session = normalizeSession(project.metadata?.[MULTITRACK_KEY] || defaultSession(project));
  const arrangement = ensureMusicArrangement(project.metadata?.[ARRANGEMENT_KEY] || {});
  const sampler = ensureMusicSamplerProject(project.metadata?.[SAMPLER_KEY] || {});
  validateMusicArrangement(arrangement); validateMusicSamplerProject(sampler);
  return { session, arrangement, sampler };
}

function history(project) {
  const source = Array.isArray(project.metadata?.[HISTORY_KEY]) ? project.metadata[HISTORY_KEY] : [];
  return source.slice(-MAX_HISTORY);
}

function ensureHarmonyFoundation(session) {
  let track = session.midi.tracks.find((entry) => entry.midi_channel !== 10 && entry.instrument?.kind !== "drum_machine");
  if (!track) {
    track = createMusicMidiTrack({ name:"Producer Harmony", midi_channel:1, instrument:{ kind:"owned_synth", instrument_id:"avantiqo-browser-midi-v1", preset_id:"studio_keys" } });
    session.midi.tracks.push(track);
  }
  if (!track.clips.length) {
    const clip = createMusicMidiClip({ name:"Harmony Foundation", start_beat:0, duration_beats:32 });
    clip.original_performance = { notes:[], control_events:[], immutable:true, captured_at:null, source:"MUSIC_PRODUCER_FOUNDATION" };
    track.clips.push(clip);
  }
  return track.id;
}

function ensureDrumFoundation(session) {
  let track = session.midi.tracks.find((entry) => entry.midi_channel === 10 || entry.instrument?.kind === "drum_machine");
  if (!track) {
    track = createMusicMidiTrack({ name:"Producer Drums", midi_channel:10, instrument:{ kind:"drum_machine", instrument_id:"avantiqo-browser-drums-v1" } });
    session.midi.tracks.push(track);
  }
  if (!track.clips.length) {
    const clip = createMusicMidiClip({ name:"Drum Foundation", start_beat:0, duration_beats:4 });
    clip.drum_pattern = createMusicMidiDrumPattern({ steps:16, bars:1, beats_per_bar:4 });
    clip.original_performance = { notes:[], control_events:[], immutable:true, captured_at:null, source:"MUSIC_PRODUCER_FOUNDATION" };
    track.clips.push(clip);
  }
  return track.id;
}

async function persistMutation(project, state, snapshot, action) {
  validateMusicMultitrackProject(state.session);
  validateMusicMidiProject(state.session.midi);
  validateMusicArrangement(state.arrangement);
  validateMusicSamplerProject(state.sampler);
  state.session.revision = Math.max(0, Math.round(finite(state.session.revision,0))) + 1;
  const nextHistory = [...history(project), snapshot].slice(-MAX_HISTORY);
  await CreativeProjectRepository.update(project.id, {
    metadata:{
      ...(project.metadata || {}),
      [MULTITRACK_KEY]:state.session,
      [ARRANGEMENT_KEY]:state.arrangement,
      [SAMPLER_KEY]:state.sampler,
      [HISTORY_KEY]:nextHistory,
      music_producer_last_action:action,
      music_producer_updated_at:new Date().toISOString(),
      music_multitrack_updated_at:new Date().toISOString(),
      music_midi_updated_at:new Date().toISOString(),
    },
  });
  return { state, history:nextHistory };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({success:false,error:"organization_id required"},{status:400});
    await requireAccess(request,organizationId);
    const project = await projectInScope(organizationId,projectId);
    const state = projectState(project);
    const action = text(body.action || "analyze").toLowerCase();

    if (action === "analyze") {
      const plan = analyzeMusicProducerProject(state);
      return NextResponse.json({success:true,contract:"AVANTIQO_MUSIC_PRODUCER_API_V1",plan,revision:state.session.revision||0,undo_available:history(project).length>0,provider_job_submitted:false,endpoint_mutation_performed:false},{headers:{"Cache-Control":"no-store"}});
    }

    if (action === "undo") {
      const entries = history(project);
      const snapshot = entries.at(-1);
      if (!snapshot) throw new Error("CREATIVE_MUSIC_PRODUCER_UNDO_NOT_AVAILABLE");
      validateMusicProducerSnapshot(snapshot);
      const restoredSession = normalizeSession(snapshot.session || defaultSession(project));
      restoredSession.revision = Math.max(0,Math.round(finite(state.session.revision,0))) + 1;
      const restoredArrangement = ensureMusicArrangement(snapshot.arrangement || {});
      const restoredSampler = ensureMusicSamplerProject(snapshot.sampler || {});
      const remaining = entries.slice(0,-1);
      await CreativeProjectRepository.update(project.id,{metadata:{...(project.metadata||{}),[MULTITRACK_KEY]:restoredSession,[ARRANGEMENT_KEY]:restoredArrangement,[SAMPLER_KEY]:restoredSampler,[HISTORY_KEY]:remaining,music_producer_last_action:"UNDO",music_producer_updated_at:new Date().toISOString(),music_multitrack_updated_at:new Date().toISOString(),music_midi_updated_at:new Date().toISOString()}});
      return NextResponse.json({success:true,contract:"AVANTIQO_MUSIC_PRODUCER_API_V1",action:"undo",revision:restoredSession.revision,restored_snapshot_id:snapshot.id,undo_available:remaining.length>0,source_assets_preserved:true,provider_job_submitted:false,endpoint_mutation_performed:false},{headers:{"Cache-Control":"no-store"}});
    }

    const expected = Math.max(0,Math.round(finite(body.expected_revision,-1)));
    const revision = Math.max(0,Math.round(finite(state.session.revision,0)));
    if (revision !== expected) { const error = new Error(`CREATIVE_MUSIC_PRODUCER_REVISION_CONFLICT:expected=${expected}:current=${revision}`); error.status=409; throw error; }
    const snapshot = createMusicProducerSnapshot({...state,action});
    const next = { session:structuredClone(state.session), arrangement:structuredClone(state.arrangement), sampler:structuredClone(state.sampler) };
    const evidence = {};

    if (action === "build_standard_structure") {
      if ((next.arrangement.sections || []).length) throw new Error("CREATIVE_MUSIC_PRODUCER_STRUCTURE_ALREADY_EXISTS");
      next.arrangement = buildMusicArrangementTemplate({template:"standard",bars_per_section:8,beats_per_bar:4});
      evidence.section_count = next.arrangement.sections.length;
    } else if (action === "create_harmony_midi_foundation") {
      evidence.track_id = ensureHarmonyFoundation(next.session);
    } else if (action === "create_drum_midi_foundation") {
      evidence.track_id = ensureDrumFoundation(next.session);
    } else if (action === "build_foundations") {
      if (!(next.arrangement.sections || []).length) next.arrangement = buildMusicArrangementTemplate({template:"standard",bars_per_section:8,beats_per_bar:4});
      evidence.harmony_track_id = ensureHarmonyFoundation(next.session);
      evidence.drum_track_id = ensureDrumFoundation(next.session);
      evidence.section_count = next.arrangement.sections.length;
    } else {
      throw new Error("CREATIVE_MUSIC_PRODUCER_ACTION_INVALID");
    }

    const persisted = await persistMutation(project,next,snapshot,action);
    const plan = analyzeMusicProducerProject(persisted.state);
    return NextResponse.json({success:true,contract:"AVANTIQO_MUSIC_PRODUCER_API_V1",action,revision:persisted.state.session.revision,evidence,plan,snapshot_id:snapshot.id,reversible:true,source_assets_preserved:true,audio_render_performed:false,owned_intelligence_inference_claimed:false,provider_job_submitted:false,endpoint_mutation_performed:false},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return NextResponse.json({success:false,error:error?.message || "Music Producer failed",provider_job_submitted:false,endpoint_mutation_performed:false},{status:error?.status || 400});
  }
}
