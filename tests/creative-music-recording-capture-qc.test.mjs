import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeMusicCaptureQc } from "../lib/creative/music/client/MusicCaptureQcRuntime.js";

function sine({amp=.2,dc=0,frames=48000,freq=440,rate=48000}={}){const a=new Float32Array(frames);for(let i=0;i<frames;i+=1)a[i]=dc+amp*Math.sin(2*Math.PI*freq*i/rate);return a;}

test("capture QC measures headroom crest DC floor and channel balance without mutating audio",()=>{
  const left=sine({amp:.2}),right=sine({amp:.2});
  const qc=analyzeMusicCaptureQc([left,right],48000);
  assert.equal(qc.contract,"AVANTIQO_MUSIC_CAPTURE_QC_V2");
  assert.equal(qc.measured,true);
  assert.equal(qc.automatic_capture_repair_allowed,false);
  assert.equal(qc.immutable_original_take,true);
  assert.ok(Number.isFinite(qc.headroom_db));
  assert.ok(Number.isFinite(qc.crest_factor_db));
  assert.equal(qc.background_floor_estimate_dbfs,null);
  assert.equal(qc.background_floor_confidence,"UNVERIFIED_NO_QUIET_WINDOWS");
  assert.ok(!qc.warnings.includes("HIGH_BACKGROUND_FLOOR"));
  assert.equal(qc.channel_imbalance_db,0);
});

test("capture QC flags DC offset and stereo imbalance and clipping",()=>{
  const left=sine({amp:.9995,dc:.02}),right=sine({amp:.1});
  const qc=analyzeMusicCaptureQc([left,right],48000);
  assert.equal(qc.status,"RETAKE_REQUIRED");
  assert.ok(qc.warnings.includes("CLIPPING"));
  assert.ok(qc.warnings.includes("DC_OFFSET"));
  assert.ok(qc.warnings.includes("CHANNEL_IMBALANCE"));
});

test("capture paths persist measured QC rather than clipping-only status",()=>{
  const raw=fs.readFileSync("lib/creative/music/client/MusicRawPcmCapture.js","utf8");
  const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicRecordingStudioPanel.jsx","utf8");
  const overdub=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx","utf8");
  const route=fs.readFileSync("app/api/creative/music/auto-studio/route.js","utf8");
  assert.match(raw,/analyzeMusicCaptureQc/);assert.match(raw,/background_floor_estimate_dbfs/);
  assert.match(panel,/captureQc/);assert.match(overdub,/capture_qc/);assert.match(route,/capture_qc/);
});


test("capture QC only claims background floor when quiet evidence exists",()=>{
  const rate=48000,signal=new Float32Array(rate*2);
  for(let i=0;i<signal.length;i+=1){const t=i/rate;const amp=t<.5||t>1.5?.002:.2;signal[i]=amp*Math.sin(2*Math.PI*440*t);}
  const qc=analyzeMusicCaptureQc([signal],rate);
  assert.ok(Number.isFinite(qc.background_floor_estimate_dbfs));
  assert.equal(qc.background_floor_confidence,"QUIET_WINDOWS");
  assert.ok(qc.background_floor_quiet_window_count>=3);
});

test("quiet room-tone capture can establish floor without performance windows",()=>{
  const quiet=sine({amp:.003});
  const qc=analyzeMusicCaptureQc([quiet],48000);
  assert.ok(Number.isFinite(qc.background_floor_estimate_dbfs));
  assert.equal(qc.background_floor_confidence,"QUIET_CAPTURE");
});
