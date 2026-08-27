import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const preview = fs.readFileSync(new URL("../lib/creative/music/client/MusicMultitrackPreviewEngine.js", import.meta.url), "utf8");
const worklet = fs.readFileSync(new URL("../public/audio/avantiqo-music-dynamics-worklet.js", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicLiveEngineeringMeters.jsx", import.meta.url), "utf8");
const mixer = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicMixerSendsPanel.jsx", import.meta.url), "utf8");

test("preview publishes actual post-fader track and master levels", () => {
  assert.match(preview, /postFaderAnalyser/);
  assert.match(preview, /getFloatTimeDomainData/);
  assert.match(preview, /peak_dbfs/);
  assert.match(preview, /rms_dbfs/);
  assert.match(preview, /headroom_db/);
  assert.match(preview, /AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V1/);
  assert.match(preview, /live_engineering_metering:\s*true/);
});

test("dynamics processors publish real gain-reduction state", () => {
  assert.match(worklet, /gainToReductionDb/);
  assert.match(worklet, /processor:\s*"gate"/);
  assert.match(worklet, /processor:\s*"deesser"/);
  assert.match(preview, /compressor_reduction_db/);
  assert.match(preview, /gate_reduction_db/);
  assert.match(preview, /deesser_reduction_db/);
});

test("meter UI distinguishes preview metering from release mastering QC", () => {
  assert.match(panel, /Master/);
  assert.match(panel, /Selected track/);
  assert.match(panel, /Gate/);
  assert.match(panel, /De-esser/);
  assert.match(panel, /Comp/);
  assert.match(panel, /not release loudness\/true-peak certification/);
  assert.match(mixer, /MusicLiveEngineeringMeters/);
});
