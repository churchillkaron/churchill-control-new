export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import {
  addMusicArrangementSection,
  buildMusicArrangementTemplate,
  ensureMusicArrangement,
  removeMusicArrangementSection,
  updateMusicArrangementSection,
  validateMusicArrangement,
} from "@/lib/creative/music/runtime/CreativeMusicArrangementRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { ensureMusicMidiProject, validateMusicMidiProject } from "@/lib/creative/music/runtime/CreativeMusicMidiRuntime";
import { createMusicMultitrackProject, validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const KEY = "music_arrangement";
const MULTITRACK_KEY = "music_multitrack_project";
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_ARRANGEMENT_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) { const error = new Error("CREATIVE_MUSIC_ARRANGEMENT_PROJECT_NOT_FOUND"); error.status = 404; throw error; }
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

async function persist(project, arrangement) {
  validateMusicArrangement(arrangement);
  await CreativeProjectRepository.update(project.id, { metadata: { ...(project.metadata || {}), [KEY]: arrangement, music_arrangement_updated_at:new Date().toISOString() } });
  return arrangement;
}

function duplicateSectionMaterial({ session, sourceSection, targetStartBeat }) {
  const next = structuredClone(session);
  const bpm = Math.max(30, Math.min(300, finite(next.bpm, 120)));
  const secondsPerBeat = 60 / bpm;
  const sourceStartBeat = finite(sourceSection.start_beat, 0);
  const sourceEndBeat = finite(sourceSection.end_beat, sourceStartBeat + finite(sourceSection.duration_beats, 0));
  const targetBeat = Math.max(0, finite(targetStartBeat, sourceEndBeat));
  const deltaBeat = targetBeat - sourceStartBeat;
  const sourceStartSeconds = sourceStartBeat * secondsPerBeat;
  const sourceEndSeconds = sourceEndBeat * secondsPerBeat;
  const deltaSeconds = deltaBeat * secondsPerBeat;
  let audioClipsDuplicated = 0;
  let audioBoundaryClipsSkipped = 0;
  let midiClipsDuplicated = 0;
  let midiBoundaryClipsSkipped = 0;
  let automationPointsDuplicated = 0;

  for (const track of next.tracks || []) {
    const additions = [];
    for (const clip of track.clips || []) {
      const start = finite(clip.start_seconds, 0);
      const end = start + finite(clip.duration_seconds, 0);
      const overlaps = end > sourceStartSeconds + 1e-6 && start < sourceEndSeconds - 1e-6;
      const contained = start >= sourceStartSeconds - 1e-6 && end <= sourceEndSeconds + 1e-6;
      if (overlaps && !contained) { audioBoundaryClipsSkipped += 1; continue; }
      if (!contained) continue;
      additions.push({
        ...structuredClone(clip),
        id: `clip-${randomUUID()}`,
        start_seconds: start + deltaSeconds,
        preserve_source_asset: true,
        destructive_edit: false,
        arrangement_duplicate: {
          contract: "AVANTIQO_MUSIC_ARRANGEMENT_CLIP_DUPLICATE_V1",
          source_clip_id: clip.id,
          source_section_id: sourceSection.id,
          source_start_seconds: start,
          duplicated_at: new Date().toISOString(),
        },
      });
      audioClipsDuplicated += 1;
    }
    track.clips = [...(track.clips || []), ...additions].sort((a,b) => finite(a.start_seconds,0) - finite(b.start_seconds,0));
  }

  for (const lane of next.automation_lanes || []) {
    const additions = (lane.points || [])
      .filter((point) => finite(point.time_seconds,0) >= sourceStartSeconds - 1e-6 && finite(point.time_seconds,0) < sourceEndSeconds - 1e-6)
      .map((point) => ({ ...structuredClone(point), time_seconds: finite(point.time_seconds,0) + deltaSeconds }));
    lane.points = [...(lane.points || []), ...additions].sort((a,b) => finite(a.time_seconds,0) - finite(b.time_seconds,0));
    automationPointsDuplicated += additions.length;
  }

  for (const track of next.midi?.tracks || []) {
    const additions = [];
    for (const clip of track.clips || []) {
      const start = finite(clip.start_beat,0);
      const end = start + finite(clip.duration_beats,0);
      const overlaps = end > sourceStartBeat + 1e-6 && start < sourceEndBeat - 1e-6;
      const contained = start >= sourceStartBeat - 1e-6 && end <= sourceEndBeat + 1e-6;
      if (overlaps && !contained) { midiBoundaryClipsSkipped += 1; continue; }
      if (!contained) continue;
      additions.push({
        ...structuredClone(clip),
        id: `midi-clip-${randomUUID()}`,
        start_beat: start + deltaBeat,
        destructive_edit: false,
        arrangement_duplicate: {
          contract: "AVANTIQO_MUSIC_ARRANGEMENT_MIDI_CLIP_DUPLICATE_V1",
          source_clip_id: clip.id,
          source_section_id: sourceSection.id,
          source_start_beat: start,
          duplicated_at: new Date().toISOString(),
        },
      });
      midiClipsDuplicated += 1;
    }
    track.clips = [...(track.clips || []), ...additions].sort((a,b) => finite(a.start_beat,0) - finite(b.start_beat,0));
  }

  next.revision = Math.max(0, Math.round(finite(session.revision,0))) + 1;
  normalizeSession(next);
  return {
    session: next,
    evidence: {
      contract: "AVANTIQO_MUSIC_ARRANGEMENT_MATERIAL_DUPLICATION_V1",
      source_section_id: sourceSection.id,
      target_start_beat: targetBeat,
      beat_delta: deltaBeat,
      seconds_delta: deltaSeconds,
      audio_clips_duplicated: audioClipsDuplicated,
      midi_clips_duplicated: midiClipsDuplicated,
      automation_points_duplicated: automationPointsDuplicated,
      audio_boundary_clips_skipped: audioBoundaryClipsSkipped,
      midi_boundary_clips_skipped: midiBoundaryClipsSkipped,
      originals_preserved: true,
      destructive_edit: false,
    },
  };
}

async function repeatSectionMaterial(project, currentArrangement, body) {
  const sourceSectionId = text(body.section_id);
  const sourceSection = currentArrangement.sections.find((section) => section.id === sourceSectionId);
  if (!sourceSection) throw new Error("CREATIVE_MUSIC_ARRANGEMENT_SECTION_NOT_FOUND");
  const session = normalizeSession(project.metadata?.[MULTITRACK_KEY] || defaultSession(project));
  const revision = Math.max(0, Math.round(finite(session.revision,0)));
  const expected = Math.max(0, Math.round(finite(body.expected_revision,-1)));
  if (revision !== expected) {
    const error = new Error(`CREATIVE_MUSIC_ARRANGEMENT_REVISION_CONFLICT:expected=${expected}:current=${revision}`);
    error.status = 409;
    throw error;
  }
  const arrangementEnd = Math.max(0, ...(currentArrangement.sections || []).map((section) => finite(section.end_beat,0)));
  const targetStartBeat = body.target_start_beat === undefined || body.target_start_beat === null
    ? arrangementEnd
    : Math.max(0, finite(body.target_start_beat, arrangementEnd));
  const repeatedSection = {
    ...structuredClone(sourceSection),
    id: `section-${randomUUID()}`,
    name: text(body.name || `${sourceSection.name} Repeat`).slice(0,80),
    start_beat: targetStartBeat,
    duration_beats: finite(sourceSection.duration_beats,16),
    end_beat: targetStartBeat + finite(sourceSection.duration_beats,16),
    repeat_of_section_id: sourceSection.id,
    locked: false,
  };
  const arrangement = addMusicArrangementSection(currentArrangement, repeatedSection);
  const duplicated = duplicateSectionMaterial({ session, sourceSection, targetStartBeat });
  validateMusicArrangement(arrangement);
  await CreativeProjectRepository.update(project.id, {
    metadata: {
      ...(project.metadata || {}),
      [KEY]: arrangement,
      [MULTITRACK_KEY]: duplicated.session,
      music_arrangement_updated_at: new Date().toISOString(),
      music_multitrack_updated_at: new Date().toISOString(),
      music_midi_updated_at: new Date().toISOString(),
    },
  });
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_ARRANGEMENT_API_V1",
    action: "repeat_section_material",
    arrangement,
    revision: duplicated.session.revision,
    repeated_section_id: repeatedSection.id,
    material_duplication: duplicated.evidence,
    audio_changed: false,
    source_assets_preserved: true,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({success:false,error:"organization_id required"},{status:400});
    await requireAccess(request,organizationId);
    const project=await projectInScope(organizationId,projectId);
    const current=ensureMusicArrangement(project.metadata?.[KEY] || {});
    const action=text(body.action || "load").toLowerCase();
    const session = normalizeSession(project.metadata?.[MULTITRACK_KEY] || defaultSession(project));
    if (action==="load") return NextResponse.json({success:true,contract:"AVANTIQO_MUSIC_ARRANGEMENT_API_V1",arrangement:current,revision:session.revision || 0,provider_job_submitted:false,endpoint_mutation_performed:false},{headers:{"Cache-Control":"no-store"}});
    if (action==="repeat_section_material") {
      const result = await repeatSectionMaterial(project,current,body);
      return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
    }
    let next=current;
    if (action==="template") next=buildMusicArrangementTemplate(body.template || {});
    else if (action==="add_section") next=addMusicArrangementSection(current,body.section || {});
    else if (action==="update_section") next=updateMusicArrangementSection(current,text(body.section_id),body.section || {});
    else if (action==="remove_section") next=removeMusicArrangementSection(current,text(body.section_id));
    else throw new Error("CREATIVE_MUSIC_ARRANGEMENT_ACTION_INVALID");
    const saved=await persist(project,next);
    return NextResponse.json({success:true,contract:"AVANTIQO_MUSIC_ARRANGEMENT_API_V1",action,arrangement:saved,revision:session.revision || 0,audio_changed:false,provider_job_submitted:false,endpoint_mutation_performed:false},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return NextResponse.json({success:false,error:error?.message || "Music arrangement failed",provider_job_submitted:false,endpoint_mutation_performed:false},{status:error?.status || 400});
  }
}
