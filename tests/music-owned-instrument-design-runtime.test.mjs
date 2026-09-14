import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  MUSIC_OWNED_INSTRUMENT_CONTRACT,
  designMusicOwnedInstrument,
  normalizeMusicOwnedInstrument,
} from "../lib/creative/music/runtime/CreativeMusicOwnedInstrumentRuntime.js";
import {
  createMusicMidiProject,
  createMusicMidiTrack,
  validateMusicMidiProject,
} from "../lib/creative/music/runtime/CreativeMusicMidiRuntime.js";
import { buildWorldClassMusicStudioPlan } from "../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js";

const route = fs.readFileSync(new URL("../app/api/creative/music/midi/route.js", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("../lib/creative/music/client/MusicMidiInstrumentEngine.js", import.meta.url), "utf8");
const bounce = fs.readFileSync(new URL("../lib/creative/music/client/MusicMidiBounceEngine.js", import.meta.url), "utf8");
const unified = fs.readFileSync(new URL("../lib/creative/music/client/MusicUnifiedWorkstationTransportV3.js", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicMidiStudioPanel.jsx", import.meta.url), "utf8");

test("owned instrument design is deterministic, bounded and provider-free", () => {
  const a = designMusicOwnedInstrument({ intent: "dark warm analog bass with soft attack and subtle movement" });
  const b = designMusicOwnedInstrument({ intent: "dark warm analog bass with soft attack and subtle movement" });
  assert.equal(a.contract, MUSIC_OWNED_INSTRUMENT_CONTRACT);
  assert.equal(a.preset_id, "mono_bass");
  assert.equal(a.fingerprint, b.fingerprint);
  assert.equal(a.provider_job_submitted, false);
  assert.equal(a.external_plugin_required, false);
  assert.equal(a.non_destructive, true);
  assert.ok(a.filter_cutoff_hz >= 80 && a.filter_cutoff_hz <= 18000);
  assert.ok(a.oscillators.length >= 1 && a.oscillators.length <= 4);
});

test("changing a sound parameter changes the exact instrument fingerprint", () => {
  const source = designMusicOwnedInstrument({ intent: "bright expressive lead" });
  const changed = normalizeMusicOwnedInstrument({ ...source, filter_cutoff_hz: source.filter_cutoff_hz - 400 }, source.preset_id);
  assert.notEqual(source.fingerprint, changed.fingerprint);
});

test("MIDI project rejects tampered owned instrument design", () => {
  const design = designMusicOwnedInstrument({ intent: "warm cinematic pad" });
  const project = createMusicMidiProject({});
  project.tracks.push(createMusicMidiTrack({ name: "Pad", instrument: { kind: "owned_synth", preset_id: design.preset_id, design } }));
  assert.equal(validateMusicMidiProject(project).success, true);
  project.tracks[0].instrument.design.filter_cutoff_hz += 250;
  assert.throws(() => validateMusicMidiProject(project), /CREATIVE_MUSIC_MIDI_INSTRUMENT_DESIGN_INVALID/);
});

test("Business Partner world-class planning selects sound-design specialists", () => {
  const plan = buildWorldClassMusicStudioPlan({ objective: "Make the bass darker, warmer and softer with a new synth patch" });
  assert.ok(plan.selected_capabilities.some((item) => item.id === "instrument_design"));
  const workers = new Set(plan.workers.map((worker) => worker.id));
  assert.ok(workers.has("sound_designer"));
  assert.ok(workers.has("instrument_producer"));
  assert.ok(workers.has("midi_sampler"));
});

test("all owned MIDI render paths resolve the canonical instrument definition", () => {
  for (const source of [preview, bounce, unified]) {
    assert.match(source, /CreativeMusicOwnedInstrumentRuntime/);
    assert.match(source, /resolveMusicOwnedInstrumentDefinition/);
  }
  assert.match(preview, /instrument:\s*definition/);
  assert.match(bounce, /trackInstrument/);
  assert.match(unified, /instrumentDefinition\(entry\.track\)/);
});

test("MIDI API and Studio expose revision-bound owned instrument design", () => {
  assert.match(route, /set_instrument_design/);
  assert.match(route, /expected_revision/);
  assert.match(route, /instrument_fingerprint/);
  assert.match(route, /external_plugin_hosted:\s*false/);
  assert.match(studio, /MusicInstrumentDesignerPanel/);
});
