import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildMusicListeningEvidence,
  listeningEvidenceStatus,
} from "../lib/creative/music/runtime/CreativeMusicListeningEvidenceRuntime.js";
import { buildMusicListeningContext } from "../lib/creative/music/runtime/CreativeMusicListeningContextRuntime.js";

function fixture() {
  return buildMusicListeningEvidence({
    creative_project_id: "project-1",
    master_asset_id: "master-v2",
    analysis: {
      duration_seconds: 122.4,
      source_checksum: "sha256-source",
      source_audio_measured: true,
      accepted: { bpm: 108.2, key_label: "D minor" },
      tempo: { confidence: 0.91 },
      key: { confidence: 0.82 },
      sections: {
        boundaries_seconds: [24, 48, 72, 96],
        windows: [{ start_seconds: 48, end_seconds: 50, rms: 0.18, transient_density: 0.42 }],
      },
    },
    master_report: { integrated_lufs: -13.8, true_peak_dbfs: -1.1, stereo_correlation: 0.72 },
    reviews: [{
      family: "TECHNICAL",
      failures: ["Chorus is too dense."],
      regions: [{ start_seconds: 62, end_seconds: 74, evidence: "Transient masking." }],
    }],
    reviewed_at: "2026-09-14T00:00:00.000Z",
  });
}

test("Music listening evidence is compact, measured and non-authoritative", () => {
  const evidence = fixture();
  assert.equal(evidence.contract, "AVANTIQO_MUSIC_LISTENING_EVIDENCE_V1");
  assert.equal(evidence.master_asset_id, "master-v2");
  assert.equal(evidence.version_id, "master-v2");
  assert.equal(evidence.measured.bpm, 108.2);
  assert.equal(evidence.measured.key_label, "D minor");
  assert.equal(evidence.measured.master.integrated_lufs, -13.8);
  assert.equal(evidence.source_audio_measured, true);
  assert.equal(evidence.mutation_authorized, false);
  assert.equal(evidence.publication_authorized, false);
  assert.match(evidence.evidence_fingerprint, /^[a-f0-9]{32}$/);
});

test("Music listening evidence omits raw waveform and caps bounded regions", () => {
  const evidence = fixture();
  assert.equal(Object.prototype.hasOwnProperty.call(evidence, "samples"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(evidence, "waveform"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(evidence, "transcript"), false);
  assert.equal(Array.isArray(evidence.regions), true);
  assert.equal(evidence.regions.length, 2);
  assert.equal(Array.isArray(evidence.observations), true);
});


test("tampered listening evidence fails fingerprint verification", () => {
  const evidence = fixture();
  const tampered = { ...evidence, measured: { ...evidence.measured, bpm: 222 } };
  const status = listeningEvidenceStatus(tampered, {
    current_master_asset_id: "master-v2",
    current_version_id: "master-v2",
  });
  assert.equal(status.valid, false);
  assert.equal(status.fingerprint_valid, false);
  assert.equal(status.current, false);
});

test("Dailies review regions take priority over generic dynamic windows", () => {
  const evidence = buildMusicListeningEvidence({
    creative_project_id: "project-1", master_asset_id: "master-v2",
    analysis: { source_audio_measured: true, sections: { windows: Array.from({ length: 40 }, (_, i) => ({ start_seconds: i * 2, end_seconds: i * 2 + 1, rms: 0.1, transient_density: 0.2 })) } },
    reviews: [{ family: "TECHNICAL", regions: [{ start_seconds: 90, end_seconds: 95, evidence: "review-region" }] }],
  });
  assert.equal(evidence.regions.length, 24);
  assert.equal(evidence.regions[0].source, "TECHNICAL");
  assert.equal(evidence.regions[0].evidence, "review-region");
});

test("section labels are rejected when provenance belongs to an older master", () => {
  const context = buildMusicListeningContext({
    evidence: fixture(),
    current: { current_master_asset_id: "master-v2", current_version_id: "master-v2" },
    sections: [{ start_seconds: 60, end_seconds: 90, label: "Old Chorus", master_asset_id: "master-v1", version_id: "master-v1" }],
  });
  assert.equal(context.section_labels_version_bound, true);
  assert.equal(context.section_labels_available, false);
  assert.equal(context.regions.some((region) => region.section), false);
});

test("Music listening evidence becomes stale when current master or version changes", () => {
  const evidence = fixture();
  const current = listeningEvidenceStatus(evidence, {
    current_master_asset_id: "master-v2",
    current_version_id: "master-v2",
  });
  assert.equal(current.current, true);
  assert.equal(current.stale, false);
  const stale = listeningEvidenceStatus(evidence, {
    current_master_asset_id: "master-v3",
    current_version_id: "master-v3",
  });
  assert.equal(stale.current, false);
  assert.equal(stale.stale, true);
});

const executeSource = fs.readFileSync("lib/creative/music/capabilities/executeWorldClassMusicStudio.js", "utf8");
const plannerSource = fs.readFileSync("lib/creative/music/capabilities/planWorldClassMusicStudio.js", "utf8");
const dailiesSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", "utf8");

test("user conversation patches cannot spoof listening evidence", () => {
  assert.match(executeSource, /delete conversationStatePatch\.listening_evidence/);
});

test("Dailies persists bounded listening evidence only through system settlement", () => {
  assert.match(dailiesSource, /buildMusicListeningEvidence/);
  assert.match(dailiesSource, /patch:\s*\{\s*listening_evidence:\s*listeningEvidence\s*\}/s);
  assert.match(dailiesSource, /listening_evidence:\s*listeningEvidence/);
  assert.match(dailiesSource, /CREATIVE_MUSIC_DAILIES_PROJECT_ASSET_MISMATCH/);
  assert.match(dailiesSource, /CreativeAssetsRuntime\.list/);
});

test("Business Partner Music planning exposes current or stale listening status", () => {
  assert.match(plannerSource, /listeningEvidenceStatus/);
  assert.match(plannerSource, /music_listening_evidence_status/);
  assert.match(plannerSource, /music_listening_evidence:/);
  assert.match(plannerSource, /effectiveConversationContext/);
  assert.match(plannerSource, /listening_evidence:\s*null/);
});

test("current listening evidence becomes a reasoning-safe Business Partner context", () => {
  const context = buildMusicListeningContext({
    evidence: fixture(),
    current: { current_master_asset_id: "master-v2", current_version_id: "master-v2" },
    sections: [
      { start_seconds: 0, end_seconds: 30, label: "Verse 1", master_asset_id: "master-v2", version_id: "master-v2" },
      { start_seconds: 30, end_seconds: 60, label: "Chorus 1", master_asset_id: "master-v2", version_id: "master-v2" },
      { start_seconds: 60, end_seconds: 90, label: "Chorus 2", master_asset_id: "master-v2", version_id: "master-v2" },
    ],
  });
  assert.equal(context.contract, "AVANTIQO_MUSIC_LISTENING_CONTEXT_V1");
  assert.equal(context.evidence_is_current, true);
  assert.equal(context.may_inform_advice, true);
  assert.equal(context.may_infer_user_intent, false);
  assert.equal(context.mutation_authorized, false);
  assert.equal(context.publication_authorized, false);
  assert.ok(context.reasoning_brief.some((item) => item.includes("108.2 BPM")));
  assert.ok(context.regions.some((region) => region.section?.section_label === "Chorus 2"));
});

test("stale listening evidence is excluded from reasoning context", () => {
  const context = buildMusicListeningContext({
    evidence: fixture(),
    current: { current_master_asset_id: "master-v3", current_version_id: "master-v3" },
    sections: [{ start_seconds: 60, end_seconds: 90, label: "Chorus 2" }],
  });
  assert.equal(context, null);
});

const worldClassSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js", "utf8");
const creativeDevelopmentSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicCreativeDevelopmentRuntime.js", "utf8");

test("Business Partner planning injects only the derived listening context", () => {
  assert.match(plannerSource, /buildMusicListeningContext/);
  assert.match(plannerSource, /music_listening_context:\s*listeningContext/);
  assert.match(worldClassSource, /listening_context:\s*listeningContext/);
  assert.match(worldClassSource, /listening_evidence_never_authorizes_mutation:\s*true/);
  assert.match(worldClassSource, /stale_listening_evidence_excluded_from_reasoning:\s*true/);
  assert.match(creativeDevelopmentSource, /listening_context:\s*listeningContext/);
  assert.match(creativeDevelopmentSource, /descriptive_not_user_intent:\s*true/);
  assert.match(creativeDevelopmentSource, /mutation_authorized:\s*false/);
});
