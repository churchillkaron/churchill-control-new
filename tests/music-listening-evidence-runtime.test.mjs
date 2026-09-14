import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildMusicListeningEvidence,
  listeningEvidenceStatus,
} from "../lib/creative/music/runtime/CreativeMusicListeningEvidenceRuntime.js";

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
});

test("Business Partner Music planning exposes current or stale listening status", () => {
  assert.match(plannerSource, /listeningEvidenceStatus/);
  assert.match(plannerSource, /music_listening_evidence_status/);
  assert.match(plannerSource, /music_listening_evidence:/);
});
