import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const inserts = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicInsertRuntime.js", import.meta.url), "utf8");
const worklet = fs.readFileSync(new URL("../public/audio/avantiqo-music-dynamics-worklet.js", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("../lib/creative/music/client/MusicMultitrackPreviewEngine.js", import.meta.url), "utf8");
const insertPanel = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicEngineeringInsertsPanel.jsx", import.meta.url), "utf8");
const mixerPanel = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicMixerSendsPanel.jsx", import.meta.url), "utf8");

test("engineering insert contracts are non-destructive", () => {
  assert.match(inserts, /"gate", "deesser", "saturation"/);
  assert.match(inserts, /destructive_processing_allowed:\s*false/);
  assert.match(inserts, /CREATIVE_MUSIC_INSERT_DESTRUCTIVE_FORBIDDEN/);
});

test("gate and de-esser are real audio worklet processors", () => {
  assert.match(worklet, /class AvantiqoGateProcessor extends AudioWorkletProcessor/);
  assert.match(worklet, /class AvantiqoDeEsserProcessor extends AudioWorkletProcessor/);
  assert.match(worklet, /registerProcessor\("avantiqo-music-gate"/);
  assert.match(worklet, /registerProcessor\("avantiqo-music-deesser"/);
  assert.match(worklet, /holdRemaining/);
  assert.match(worklet, /maxReductionDb/);
});

test("browser preview enforces the professional processing order", () => {
  const trim = preview.indexOf("trim.connect(polarity)");
  const gate = preview.indexOf('enabledInsert(track, "gate")');
  const highPass = preview.indexOf("chain.connect(highPass)");
  const deesser = preview.indexOf('enabledInsert(track, "deesser")');
  const saturation = preview.indexOf('enabledInsert(track, "saturation")');
  const compressor = preview.indexOf("const compressor = context.createDynamicsCompressor()");
  const fader = preview.indexOf("const fader = context.createGain()");
  assert.ok(trim >= 0);
  assert.ok(gate > trim);
  assert.ok(highPass > gate);
  assert.ok(deesser > highPass);
  assert.ok(saturation > deesser);
  assert.ok(compressor > saturation);
  assert.ok(fader > compressor);
  assert.match(preview, /engineering_inserts_aware:\s*true/);
  assert.match(preview, /audioWorklet\.addModule\("\/audio\/avantiqo-music-dynamics-worklet\.js"\)/);
});

test("engineer UI exposes gate de-esser saturation and full compressor parameters", () => {
  assert.match(insertPanel, /Gate \/ Expander/);
  assert.match(insertPanel, /De-esser/);
  assert.match(insertPanel, /Saturation/);
  assert.match(insertPanel, /Threshold/);
  assert.match(insertPanel, /Max reduction/);
  assert.match(insertPanel, /Drive dB/);
  assert.match(mixerPanel, /Channel compressor/);
  assert.match(mixerPanel, /Threshold dB/);
  assert.match(mixerPanel, /Ratio/);
  assert.match(mixerPanel, /Attack ms/);
  assert.match(mixerPanel, /Release ms/);
  assert.match(mixerPanel, /Knee dB/);
  assert.match(mixerPanel, /Makeup dB/);
});
