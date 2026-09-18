import { buildMusicCreativeDevelopment } from "./CreativeMusicCreativeDevelopmentRuntime.js";
import { buildMusicCapabilityReadiness } from "./CreativeMusicCapabilityReadinessRuntime.js";
import { buildMusicProfessionalProductionManifest } from "./CreativeMusicProfessionalProductionRuntime.js";
import { CreativeProfessionalAudioEngineRuntime } from "./CreativeProfessionalAudioEngineRuntime.js";
const CONTRACT = "AVANTIQO_WORLD_CLASS_MUSIC_STUDIO_V1";


const PHASES = Object.freeze([
  "BRIEF",
  "RESEARCH_REFERENCE",
  "CREATIVE_DIRECTION",
  "CONCEPT_COMPETITION",
  "PREPRODUCTION",
  "PRODUCTION",
  "DAILIES_LISTENING",
  "EDIT_REPAIR",
  "MIX",
  "MASTER",
  "QUALITY_TRIBUNAL",
  "DELIVERY_RELEASE",
]);

const WORKERS = Object.freeze([
  { id: "executive_producer", name: "Executive Producer", phases: ["BRIEF", "DELIVERY_RELEASE"], purpose: "Own outcome, scope, budget, approvals and final delivery." },
  { id: "music_director", name: "Music Director", phases: ["BRIEF", "CREATIVE_DIRECTION", "CONCEPT_COMPETITION"], purpose: "Turn intent into a coherent musical identity and production direction." },
  { id: "research_reference", name: "Research & Reference Producer", phases: ["RESEARCH_REFERENCE"], purpose: "Research genre, era, instrumentation, audience, cultural context and technical references." },
  { id: "composer", name: "Composer", phases: ["CONCEPT_COMPETITION", "PREPRODUCTION", "PRODUCTION"], purpose: "Create original musical material, motifs and complete compositions." },
  { id: "songwriter", name: "Songwriter", phases: ["CONCEPT_COMPETITION", "PREPRODUCTION"], purpose: "Develop lyrical, hook, form and song-concept options when vocals are requested." },
  { id: "melody_specialist", name: "Melody Specialist", phases: ["CONCEPT_COMPETITION", "PREPRODUCTION"], purpose: "Design, vary and critique memorable melodic material." },
  { id: "harmony_specialist", name: "Harmony Specialist", phases: ["CONCEPT_COMPETITION", "PREPRODUCTION"], purpose: "Design chord language, harmonic motion, voicing and tonal tension." },
  { id: "arranger", name: "Arranger", phases: ["PREPRODUCTION", "PRODUCTION"], purpose: "Shape structure, instrumentation, dynamics, transitions and section development." },
  { id: "rhythm_producer", name: "Rhythm & Drum Producer", phases: ["PREPRODUCTION", "PRODUCTION"], purpose: "Build groove, drums, percussion, pulse and rhythmic variation." },
  { id: "sound_designer", name: "Sound Designer", phases: ["PREPRODUCTION", "PRODUCTION", "EDIT_REPAIR"], purpose: "Create textures, impacts, transitions, sonic branding and synthetic sound." },
  { id: "sfx_foley", name: "SFX & Foley Designer", phases: ["PRODUCTION", "EDIT_REPAIR"], purpose: "Create and edit effects, foley, ambience, risers, hits and sync sound." },
  { id: "recording_engineer", name: "Recording Engineer", phases: ["PRODUCTION"], purpose: "Capture vocals and instruments with technically clean, preserved source takes." },
  { id: "vocal_producer", name: "Vocal Producer", phases: ["PRODUCTION", "EDIT_REPAIR"], purpose: "Direct vocal performance, comping, tuning, timing, doubles, harmonies and vocal sound." },
  { id: "voice_identity_producer", name: "Voice Identity Producer", phases: ["PREPRODUCTION", "PRODUCTION", "QUALITY_TRIBUNAL"], purpose: "Manage consented singer identity references, vocal isolation, singing conversion and identity-fidelity review." },
  { id: "instrument_producer", name: "Instrument Producer", phases: ["PRODUCTION", "EDIT_REPAIR"], purpose: "Direct and refine live or virtual instrument performances." },
  { id: "audio_editor", name: "Audio Editor", phases: ["DAILIES_LISTENING", "EDIT_REPAIR"], purpose: "Perform non-destructive editing, comping, cleanup, timing and structural repair." },
  { id: "restoration_engineer", name: "Audio Restoration Engineer", phases: ["EDIT_REPAIR"], purpose: "Repair noise, hum, clicks, clipping, harshness, bleed and source defects conservatively." },
  { id: "stem_specialist", name: "Stem & Source Separation Specialist", phases: ["PRODUCTION", "EDIT_REPAIR"], purpose: "Separate vocals, drums, bass and other material; create karaoke and acapella assets." },
  { id: "midi_sampler", name: "MIDI & Sampler Producer", phases: ["PREPRODUCTION", "PRODUCTION"], purpose: "Create/edit MIDI, drum programming, samples, instruments and performance automation." },
  { id: "mix_engineer", name: "Mix Engineer", phases: ["MIX"], purpose: "Build hierarchy, balance, space, tone, dynamics, automation and translation." },
  { id: "supervising_sound_editor", name: "Supervising Sound Editor", phases: ["PREPRODUCTION", "PRODUCTION", "EDIT_REPAIR", "MIX"], purpose: "Own picture-locked sound editorial, cue hierarchy, source layering and continuity across dialogue, Foley, effects and ambience." },
  { id: "dialogue_editor", name: "Dialogue & VO Editor", phases: ["PRODUCTION", "EDIT_REPAIR", "MIX"], purpose: "Edit production dialogue, VO and ADR for intelligibility, continuity, sync and language-ready delivery stems." },
  { id: "foley_supervisor", name: "Foley Supervisor", phases: ["PREPRODUCTION", "PRODUCTION", "EDIT_REPAIR"], purpose: "Plan, capture, edit and place synchronized footsteps, props, cloth and performance detail." },
  { id: "music_editor", name: "Music Editor", phases: ["PREPRODUCTION", "PRODUCTION", "EDIT_REPAIR", "MIX"], purpose: "Conform score and songs to picture, cuts, transitions, versions and exact cue timing." },
  { id: "re_recording_mixer", name: "Re-recording Mixer", phases: ["MIX", "MASTER"], purpose: "Build final DX/MX/FX/Foley/Ambience hierarchy, dialogue priority, spatial field, downmix translation and cinema/broadcast mixes." },
  { id: "delivery_engineer", name: "Audio Delivery Engineer", phases: ["MASTER", "QUALITY_TRIBUNAL", "DELIVERY_RELEASE"], purpose: "Create and verify full mix, M&E, DX, VO, ADR, MX, FX, Foley and ambience deliverables in the required channel layouts." },
  { id: "mastering_engineer", name: "Mastering Engineer", phases: ["MASTER"], purpose: "Create delivery-specific masters with loudness, peak, tonal and codec conformance." },
  { id: "listening_panel", name: "Independent Listening Panel", phases: ["DAILIES_LISTENING", "QUALITY_TRIBUNAL"], purpose: "Judge emotion, originality, musicality, artifacts, translation and brief fidelity independently." },
  { id: "technical_qc", name: "Technical Audio QC", phases: ["QUALITY_TRIBUNAL", "DELIVERY_RELEASE"], purpose: "Verify clipping, loudness, true peak, sample rate, channels, silence, duration and file integrity." },
  { id: "rights_release", name: "Rights & Release Producer", phases: ["BRIEF", "DELIVERY_RELEASE"], purpose: "Track source rights, provenance, versions, metadata and release constraints." },
  { id: "business_partner", name: "Business Partner Liaison", phases: PHASES, purpose: "Translate natural-language requests into governed Music Studio plans, actions, questions and results." },
]);

const CAPABILITIES = Object.freeze([
  ["compose_music", "Create original music or instrumental compositions", "ai.music.generate", "CERTIFIED"],
  ["create_song", "Create complete songs from musical direction and lyrics", "ai.music.generate", "CERTIFIED"],
  ["melody", "Create, vary and develop melodies", "creative.music.midi", "IMPLEMENTED"],
  ["harmony_chords", "Create chord progressions, harmony and voicing", "creative.music.midi", "IMPLEMENTED"],
  ["arrangement", "Build and edit song structure and arrangement", "creative.music.arrangement", "IMPLEMENTED"],
  ["midi", "Create, import, export and edit MIDI", "creative.music.midi", "IMPLEMENTED"],
  ["drums_groove", "Program drums, percussion and groove", "creative.music.midi", "IMPLEMENTED"],
  ["sampler", "Create sample-based instruments and performances", "creative.music.sampler", "IMPLEMENTED"],
  ["instrument_design", "Design owned playable synth instruments from musical intent", "creative.music.instrument_design", "IMPLEMENTED"],
  ["record_vocals", "Record vocals into immutable multitrack takes", "creative.music.record", "IMPLEMENTED"],
  ["record_instruments", "Record instruments into immutable multitrack takes", "creative.music.record", "IMPLEMENTED"],
  ["overdub_comp", "Overdub, take management and comping", "creative.music.multitrack", "IMPLEMENTED"],
  ["stem_separation", "Separate vocals, drums, bass and other stems", "ai.audio.stems", "CERTIFICATION_GATED"],
  ["vocal_role_separation", "Separate lead, backing, harmony and choir roles without substituting ordinary four-stem separation", "ai.audio.vocal-role-separate", "RESEARCH_GATED"],
  ["remove_vocals", "Create performance-ready backing or karaoke tracks", "ai.audio.stems", "CERTIFICATION_GATED"],
  ["isolate_vocals", "Create vocal/acapella stems", "ai.audio.stems", "CERTIFICATION_GATED"],
  ["singing_voice_identity", "Use an authorized Voice Library identity for zero-shot singing voice conversion", "ai.audio.singing-voice-convert", "RESEARCH_GATED"],
  ["backing_track", "Remove vocals, change key/tempo and export backing tracks", "ai.audio.stems", "CERTIFICATION_GATED"],
  ["remix", "Rework source music into a new direction", "ai.audio.remix", "BENCHMARK_GATED"],
  ["ai_edit", "Repaint or replace selected musical sections", "ai.audio.edit", "BENCHMARK_GATED"],
  ["extend", "Continue or outpaint an existing composition", "ai.audio.extend", "BENCHMARK_GATED"],
  ["time_pitch", "Time-stretch, conform tempo and pitch/key shift", "creative.music.elastic_audio", "IMPLEMENTED"],
  ["pitch_tuning", "Analyze and tune vocal or monophonic pitch", "creative.music.vocal_tune.render", "ENGINE_GATED"],
  ["timing_correction", "Analyze and correct vocal/instrument timing", "creative.music.vocal_timing", "ENGINE_GATED"],
  ["audio_cleanup", "Denoise, dehum, de-click, de-ess and repair source audio", "creative.music.vocal-engineering.local", "IMPLEMENTED"],
  ["mix", "Mix multitrack sessions with routing, buses, EQ, dynamics and automation", "creative.music.mix", "IMPLEMENTED"],
  ["master", "Create loudness and true-peak conformed masters", "creative.audio.finish", "IMPLEMENTED"],
  ["sfx", "Create and edit sound effects, transitions and sonic-brand assets", "ai.sfx.generate", "READINESS_DEPENDENT"],
  ["foley", "Create and edit synchronized foley and ambience", "creative.audio.foley", "FOUNDATION_READY"],
  ["audio_for_video", "Build music/SFX synchronized to picture, cue points and timecode", "creative.audio.timeline", "IMPLEMENTED"],
  ["cinematic_sound_design", "Create picture-locked layered cinematic sound objects and spatial movement", "creative.audio.sound-design", "IMPLEMENTED"],
  ["audio_post", "Edit and mix dialogue, VO, ADR, music, effects, Foley and ambience against locked picture", "creative.audio.post", "IMPLEMENTED"],
  ["surround_mix", "Author and render discrete stereo, 5.1 and 7.1 mixes with spatial automation and downmix QC", "creative.audio.surround", "IMPLEMENTED"],
  ["immersive_object_audio", "Author moving object audio with azimuth, elevation, distance, Doppler, reflections and HRTF binaural headphone monitoring", "creative.audio.immersive-object", "IMPLEMENTED"],
  ["vehicle_acoustic_analysis", "Measure vehicle fundamentals/harmonics and map RPM combustion frequency to musical pitch before spatial sound design", "creative.audio.vehicle-acoustics", "IMPLEMENTED"],
  ["vehicle_sound_synthesis", "Generate owned RPM-driven fictional/sweetener vehicle layers without impersonating a measured real vehicle recording", "creative.audio.vehicle-synthesis", "IMPLEMENTED"],
  ["professional_post_stems", "Render governed DX, VO, ADR, MX, FX, Foley, Ambience, M&E and full-program stems", "creative.audio.delivery-stems", "IMPLEMENTED"],
  ["analysis", "Analyze BPM, key, pitch, timing, loudness, waveform and musical structure", "creative.music.analysis", "IMPLEMENTED"],
  ["release_render", "Render pre-master, master, stems and delivery variants", "creative.music.release", "IMPLEMENTED"],
  ["quality_review", "Independent musical, perceptual and technical review", "creative.music.quality", "FOUNDATION_READY"],
]);

function text(value) { return String(value ?? "").trim(); }
function configuredAudioCertificationStatus(capability, fallback) {
  const certified = new Set(String(process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES || "ai.music.generate")
    .split(",").map((value) => value.trim()).filter(Boolean));
  return certified.has(capability) ? "CERTIFIED" : fallback;
}
function words(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean); }
const INTENT_HINTS = Object.freeze({
  backing_track: ["backing", "karaoke", "remove vocals", "without vocals", "instrumental from"],
  isolate_vocals: ["isolate vocal", "acapella", "a cappella", "vocals only"],
  stem_separation: ["stem", "separate drums", "separate bass", "split track"],
  vocal_role_separation: ["separate lead vocal", "separate backing vocals", "keep backing vocals", "lead and backing vocals", "vocal roles"],
  singing_voice_identity: ["use my voice", "use her voice", "use his voice", "sing in my voice", "sing in her voice", "sing in his voice", "voice clone for song", "singing voice", "make her voice", "make his voice"],
  sfx: ["sound effect", "sfx", "riser", "impact", "whoosh", "transition sound"],
  remix: ["remix", "rework this song"],
  extend: ["extend", "continue this song", "make this longer"],
  ai_edit: ["replace section", "change section", "edit this part"],
  melody: ["melody", "hook", "tune"],
  harmony_chords: ["chord", "harmony", "harmonies"],
  drums_groove: ["drum", "drums", "beat", "groove", "percussion"],
  instrument_design: ["design a sound", "design synth", "synth patch", "instrument sound", "make the bass", "make this bass", "sound design"],
  pitch_tuning: ["tune vocal", "autotune", "pitch correct", "pitch correction"],
  timing_correction: ["timing correction", "tighten vocal", "align vocal"],
  master: ["master this", "mastering", "release master"],
  mix: ["mix this", "mixing", "balance tracks"],
  record_vocals: ["record vocal", "record singer", "record voice"],
  record_instruments: ["record guitar", "record instrument", "record piano", "record bass"],
  audio_for_video: ["music for video", "score video", "sync to video", "soundtrack", "audio for video"],
  cinematic_sound_design: ["cinematic sound", "sound design for video", "vehicle sound", "foley for film", "sound effects for film", "lamborghini sound"],
  audio_post: ["audio post", "post production audio", "dialogue edit", "adr", "re-recording mix", "sound for commercial", "sound for film", "sound for movie"],
  surround_mix: ["5.1", "7.1", "surround mix", "surround sound"],
  immersive_object_audio: ["8d sound", "binaural", "immersive audio", "object audio", "doppler", "spatial audio"],
  vehicle_acoustic_analysis: ["engine frequency", "engine sound", "rpm pitch", "vehicle acoustics", "engine harmonics"],
  vehicle_sound_synthesis: ["engine simulator", "synthetic engine", "fictional supercar", "vehicle synthesizer", "engine sweetener"],
  professional_post_stems: ["m&e", "music and effects", "dialogue stem", "dx stem", "fx stem", "delivery stems"],
  create_song: ["make a song", "create a song", "write a song", "song with vocals"],
  compose_music: ["make music", "create music", "compose", "instrumental", "background music", "score"],
});

function detectCapabilities(objective) {
  const haystack = ` ${words(objective).join(" ")} `;
  const hits = [];
  for (const [capability, hints] of Object.entries(INTENT_HINTS)) {
    if (hints.some((hint) => haystack.includes(` ${words(hint).join(" ")} `))) hits.push(capability);
  }
  return hits.length ? [...new Set(hits)] : ["compose_music"];
}
function capabilityRecord(row) {
  const status = row[2].startsWith("ai.audio.") ? configuredAudioCertificationStatus(row[2], row[3]) : row[3];
  return { id: row[0], description: row[1], capability: row[2], status };
}

export function listWorldClassMusicCapabilities() {
  return CAPABILITIES.map(capabilityRecord);
}

export function listWorldClassMusicWorkers() {
  return WORKERS.map((worker) => ({ ...worker, phases: [...worker.phases] }));
}

export function buildWorldClassMusicStudioPlan(input = {}) {
  const objective = text(input.objective || input.request || input.brief);
  if (!objective) throw new Error("CREATIVE_MUSIC_WORLD_CLASS_OBJECTIVE_REQUIRED");
  const requested = Array.isArray(input.capabilities) && input.capabilities.length
    ? input.capabilities.map(text).filter(Boolean)
    : detectCapabilities(objective);
  const capabilityMap = new Map(listWorldClassMusicCapabilities().map((item) => [item.id, item]));
  const selected = requested.map((id) => capabilityMap.get(id)).filter(Boolean);
  const selectedIds = new Set(selected.map((item) => item.id));
  const workerIds = new Set([
    "executive_producer", "music_director", "listening_panel",
    "technical_qc", "rights_release", "business_partner",
  ]);

  if (selectedIds.has("compose_music") || selectedIds.has("create_song")) {
    ["research_reference", "composer", "melody_specialist", "harmony_specialist", "arranger", "rhythm_producer"].forEach((id) => workerIds.add(id));
  }
  if (selectedIds.has("create_song")) workerIds.add("songwriter");
  if (["record_vocals", "pitch_tuning", "timing_correction", "singing_voice_identity"].some((id) => selectedIds.has(id))) {
    ["recording_engineer", "vocal_producer", "audio_editor", "restoration_engineer"].forEach((id) => workerIds.add(id));
  }
  if (selectedIds.has("record_instruments")) {
    ["recording_engineer", "instrument_producer", "audio_editor"].forEach((id) => workerIds.add(id));
  }
  if (["stem_separation", "vocal_role_separation", "remove_vocals", "isolate_vocals", "backing_track"].some((id) => selectedIds.has(id))) {
    workerIds.add("stem_specialist");
  }
  if (selectedIds.has("vocal_role_separation")) ["vocal_producer", "audio_editor"].forEach((id) => workerIds.add(id));
  if (selectedIds.has("singing_voice_identity")) ["voice_identity_producer", "vocal_producer", "stem_specialist", "audio_editor"].forEach((id) => workerIds.add(id));
  if (["midi", "melody", "harmony_chords", "drums_groove", "sampler", "instrument_design"].some((id) => selectedIds.has(id))) {
    workerIds.add("midi_sampler");
  }
  if (["sfx", "foley", "audio_for_video", "cinematic_sound_design", "audio_post"].some((id) => selectedIds.has(id))) {
    ["sound_designer", "sfx_foley"].forEach((id) => workerIds.add(id));
  }
  if (["audio_for_video", "cinematic_sound_design", "audio_post", "surround_mix", "immersive_object_audio", "vehicle_acoustic_analysis", "vehicle_sound_synthesis", "professional_post_stems"].some((id) => selectedIds.has(id))) {
    ["supervising_sound_editor", "music_editor", "re_recording_mixer", "delivery_engineer"].forEach((id) => workerIds.add(id));
  }
  if (selectedIds.has("audio_post")) ["dialogue_editor", "foley_supervisor", "restoration_engineer"].forEach((id) => workerIds.add(id));
  if (selectedIds.has("instrument_design")) {
    ["sound_designer", "instrument_producer", "midi_sampler"].forEach((id) => workerIds.add(id));
  }
  if (["mix", "master", "backing_track", "compose_music", "create_song", "remix", "audio_for_video", "audio_post", "surround_mix"].some((id) => selectedIds.has(id))) {
    workerIds.add("mix_engineer");
  }
  if (["master", "backing_track", "compose_music", "create_song", "remix", "audio_for_video", "audio_post", "surround_mix", "professional_post_stems"].some((id) => selectedIds.has(id))) {
    workerIds.add("mastering_engineer");
  }
  if (["ai_edit", "extend", "remix", "audio_cleanup", "time_pitch"].some((id) => selectedIds.has(id))) {
    workerIds.add("audio_editor");
  }

  const workers = listWorldClassMusicWorkers().filter((worker) => workerIds.has(worker.id));
  const phaseGraph = PHASES.map((phase, index) => ({
    id: phase.toLowerCase(),
    phase,
    order: index + 1,
    workers: workers.filter((worker) => worker.phases.includes(phase)).map((worker) => worker.id),
    gate: ["CONCEPT_COMPETITION", "DAILIES_LISTENING", "QUALITY_TRIBUNAL"].includes(phase),
    spend_boundary: phase === "PRODUCTION",
  }));
  const blockers = selected.filter((item) => !["IMPLEMENTED", "FOUNDATION_READY", "CERTIFIED"].includes(item.status));
  const capabilityReadiness = buildMusicCapabilityReadiness({
    selected_capabilities: selected,
    source_evidence: input.source_evidence || {},
  });
  const conversationContext = input.music_conversation_context && typeof input.music_conversation_context === "object"
    ? input.music_conversation_context
    : null;
  const listeningContext = input.music_listening_context && typeof input.music_listening_context === "object"
    ? input.music_listening_context
    : null;
  const vocalIntelligence = input.music_vocal_intelligence && typeof input.music_vocal_intelligence === "object"
    ? input.music_vocal_intelligence
    : null;
  const creativeDevelopment = buildMusicCreativeDevelopment({
    ...input,
    objective,
    music_conversation_context: conversationContext,
    music_listening_context: listeningContext,
    music_vocal_intelligence: vocalIntelligence,
  });
  const professionalProduction = buildMusicProfessionalProductionManifest({
    plan: { objective, selected_capabilities: selected },
    input,
    evidence: input.professional_production_evidence || {},
  });
  return {
    contract: CONTRACT,
    title: text(input.title || "Music Studio production").slice(0, 160),
    objective,
    mode: "WORLD_CLASS_AUTO_ORCHESTRATION",
    professional_audio_engine: { contract: CreativeProfessionalAudioEngineRuntime.contract, shared_engine: true, rooms: CreativeProfessionalAudioEngineRuntime.listRooms(), dolby_branding_requires_licensed_toolchain: true },
    active_audio_rooms: CreativeProfessionalAudioEngineRuntime.listRooms().filter((room) => {
      if (room.id === "MUSIC_PRODUCTION") return selected.some((item) => ["compose_music","create_song","record_vocals","record_instruments","mix"].includes(item.id));
      if (room.id === "SOUND_DESIGN") return selected.some((item) => ["sfx","foley","cinematic_sound_design","audio_for_video","audio_post"].includes(item.id));
      if (room.id === "AUDIO_POST") return selected.some((item) => ["audio_for_video","cinematic_sound_design","audio_post","surround_mix","professional_post_stems"].includes(item.id));
      return selected.some((item) => ["master","release_render","audio_for_video","audio_post","surround_mix","professional_post_stems"].includes(item.id));
    }).map((room) => room.id),
    entrypoints: ["MUSIC_STUDIO_UI", "BUSINESS_PARTNER", "API"],
    selected_capabilities: selected,
    workers,
    phases: phaseGraph,
    creative_development: creativeDevelopment,
    professional_production: professionalProduction,
    conversation_context: conversationContext,
    listening_context: listeningContext,
    vocal_intelligence: vocalIntelligence,
    capability_readiness: capabilityReadiness,
    governance: {
      research_before_unfamiliar_or_reference_dependent_work: true,
      concept_competition_before_expensive_generation: true,
      independent_listening_review: true,
      preserve_original_sources: true,
      non_destructive_edits: true,
      paid_execution_requires_exact_budget_authority: true,
      publication_requires_explicit_authority: true,
      provider_selection_hidden_from_normal_user_flow: true,
      business_partner_can_plan_and_delegate: true,
      business_partner_authority_never_exceeds_registered_capability: true,
      intended_vs_rendered_review_required: true,
      independent_music_tribunal_required: true,
      project_conversation_state_bounded: true,
      raw_chat_transcript_saved_to_project: false,
      protected_ranges_require_explicit_change_scope: true,
      listening_evidence_may_inform_advice_only: true,
      listening_evidence_never_authorizes_mutation: true,
      stale_listening_evidence_excluded_from_reasoning: true,
      vocal_intelligence_may_inform_advice_only: true,
      vocal_intelligence_never_authorizes_mutation: true,
      vocal_role_inference_forbidden_without_declared_role: true,
      world_class_release_score_threshold: 90,
      professional_release_requires_stems: true,
      professional_release_requires_vocal_production_when_vocals_present: true,
      professional_release_requires_mix_before_master: true,
      fast_generation_must_not_be_labeled_professional_master: true,
      source_fit_preflight_required_before_paid_execution: true,
      unsuitable_source_must_fail_before_generation: true,
      source_specific_capability_gates_are_mandatory: true,
    },
    quality: {
      contract: "AVANTIQO_WORLD_CLASS_MUSIC_QUALITY_V1",
      intended_vs_rendered_required: true,
      independent_listening_required: true,
      hard_release_gates_required: true,
      release_threshold: 90,
      publication_authorized: false,
    },
    readiness: {
      planning_ready: true,
      executable_without_gated_engines: blockers.length === 0,
      source_fit_passed: capabilityReadiness.all_source_fit_passed,
      execution_ready: blockers.length === 0 && capabilityReadiness.all_execution_ready,
      gated_capabilities: blockers,
      blocked_capabilities: capabilityReadiness.blocked_capabilities,
    },
  };
}

export const CreativeMusicWorldClassStudioRuntime = Object.freeze({
  contract: CONTRACT,
  phases: PHASES,
  workers: WORKERS,
  capabilities: CAPABILITIES.map(capabilityRecord),
  buildPlan: buildWorldClassMusicStudioPlan,
});
