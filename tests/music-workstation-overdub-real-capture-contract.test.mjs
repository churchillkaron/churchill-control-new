import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const capturePath = new URL("../lib/creative/music/client/MusicRawPcmCapture.js", import.meta.url);
const overdubPath = new URL("../components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx", import.meta.url);
const workstationPath = new URL("../components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx", import.meta.url);

const capture = fs.readFileSync(capturePath, "utf8");
const overdub = fs.readFileSync(overdubPath, "utf8");
const workstation = fs.readFileSync(workstationPath, "utf8");

test("raw Music capture preserves professional recording invariants", () => {
  assert.match(capture, /echoCancellation:\s*false/);
  assert.match(capture, /noiseSuppression:\s*false/);
  assert.match(capture, /autoGainControl:\s*false/);
  assert.match(capture, /bit_depth:\s*24/);
  assert.match(capture, /gapless_pass_splitting:\s*true/);
  assert.match(capture, /immutable_original_take:\s*true/);
  assert.match(capture, /splitPass/);
});

test("raw Music capture exposes governed software monitoring without changing the recorded PCM", () => {
  assert.match(capture, /AVANTIQO_MUSIC_RAW_PCM_CAPTURE_V3/);
  assert.match(capture, /software_monitoring_supported:\s*true/);
  assert.match(capture, /software_monitoring_default:\s*"off"/);
  assert.match(capture, /function setMonitor/);
  assert.match(capture, /raw_capture_unchanged:\s*true/);
  assert.match(capture, /monitoring_post_capture_only:\s*true/);
  assert.match(capture, /clamp\(gainDb,\s*-60,\s*0,\s*-18\)/);
});

test("Workstation overdub exposes software monitoring as an explicit opt-in control", () => {
  assert.match(overdub, /const \[monitorEnabled, setMonitorEnabled\] = useState\(false\)/);
  assert.match(overdub, /const \[monitorGainDb, setMonitorGainDb\] = useState\(-18\)/);
  assert.match(overdub, /Software input monitor/);
  assert.match(overdub, /monitorMode:\s*monitorEnabled \? "software" : "off"/);
  assert.match(overdub, /monitorGainDb/);
  assert.match(overdub, /captureRef\.current\.setMonitor/);
  assert.match(overdub, /Use headphones when enabled to prevent acoustic feedback/);
  assert.match(overdub, /recorded raw PCM remains unchanged/);
});

test("Workstation overdub persists the track before microphone capture", () => {
  const saveIndex = overdub.indexOf('setPhase("SAVING PROJECT")');
  const persistIndex = overdub.indexOf("await persistWorkstationBeforeRecording()");
  const captureIndex = overdub.indexOf("await startMusicRawPcmCapture");
  assert.ok(saveIndex >= 0);
  assert.ok(persistIndex > saveIndex);
  assert.ok(captureIndex > persistIndex);
  assert.match(overdub, /multitrack_track_id:\s*selectedTrack\.id/);
});

test("overdub loop passes remain independent immutable uploads", () => {
  assert.match(overdub, /capture\.splitPass/);
  assert.match(overdub, /loopPasses/);
  assert.match(overdub, /await savePass\(pass, passIndex, region\.start\)/);
  assert.match(overdub, /action:\s*"register_recorded_take"/);
  assert.match(overdub, /source_rights_confirmed:\s*true/);
});

test("recording offset is explicit rather than guessing microphone latency", () => {
  assert.match(overdub, /Recording offset \(ms\)/);
  assert.match(overdub, /latencyCompensationSeconds/);
  assert.match(overdub, /timeline_start_seconds:\s*compensatedStart/);
  assert.match(overdub, /0 ms means no assumed microphone latency correction/);
});

test("normal Workstation transport and engineering edits are frozen during capture", () => {
  assert.match(workstation, /const \[recording, setRecording\]/);
  assert.match(workstation, /if \(!session \|\| transportRef\.current \|\| recording\) return/);
  assert.match(workstation, /disabled=\{recording\}/);
  assert.match(workstation, /MusicWorkstationOverdubPanel/);
});
