import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { deriveMusicRecordingPreflight } from "../lib/creative/music/client/MusicRecordingPreflightRuntime.js";

function take(overrides={}) { return { peak_dbfs:-12,rms_dbfs:-24,clipping:false,browser_processing_verification:"VERIFIED_DISABLED",sample_rate_path_verification:"MATCHED",capture_qc:{capture_continuity_verified:true,headroom_db:12,background_floor_estimate_dbfs:-58,background_floor_confidence:"QUIET_WINDOWS",hum_warning:false,channel_imbalance_db:0,stereo_phase_risk:false,mono_collapse_risk:false,silent_channel_count:0,...(overrides.capture_qc||{})},...overrides}; }

test("recording preflight passes a clean professional capture path",()=>{
  const r=deriveMusicRecordingPreflight(take());
  assert.equal(r.contract,"AVANTIQO_MUSIC_RECORDING_PREFLIGHT_V1");
  assert.equal(r.status,"READY");
  assert.equal(r.ready_to_record,true);
  assert.equal(r.automatic_input_gain_change_allowed,false);
});

test("recording preflight fails closed on clipping or browser processing",()=>{
  const r=deriveMusicRecordingPreflight(take({clipping:true,browser_processing_verification:"PROCESSING_PRESENT",capture_qc:{capture_continuity_verified:true,headroom_db:0.5,warnings:["CLIPPING"]}}));
  assert.equal(r.status,"NOT_READY");
  assert.ok(r.blockers.includes("CLIPPING"));
  assert.ok(r.blockers.includes("BROWSER_PROCESSING_PRESENT"));
});

test("recording preflight reviews noise hum low level and stereo phase without automatic repair",()=>{
  const r=deriveMusicRecordingPreflight(take({peak_dbfs:-34,rms_dbfs:-48,capture_qc:{capture_continuity_verified:true,headroom_db:34,background_floor_estimate_dbfs:-38,background_floor_confidence:"QUIET_WINDOWS",hum_warning:true,dominant_hum_hz:50,channel_imbalance_db:8,stereo_phase_risk:true,mono_collapse_risk:true}}));
  assert.equal(r.status,"REVIEW");
  for(const code of ["INPUT_TOO_LOW","PERFORMANCE_LEVEL_TOO_LOW","ROOM_TOO_NOISY","MAINS_HUM","CHANNEL_IMBALANCE","STEREO_PHASE_RISK","MONO_COLLAPSE_RISK"]) assert.ok(r.reviews.includes(code));
  assert.equal(r.automatic_capture_repair_allowed,false);
});

test("preflight runner is zero-save and zero-provider by contract",()=>{
  const src=fs.readFileSync("lib/creative/music/client/MusicRecordingPreflightRuntime.js","utf8");
  assert.match(src,/startMusicRawPcmCapture/);
  assert.match(src,/no_asset_created: true/);
  assert.match(src,/upload_performed: false/);
  assert.match(src,/provider_job_submitted: false/);
  assert.match(src,/gpu_inference_performed: false/);
  assert.match(src,/diagnostic_pcm_retained: false/);
});


test("Recording Studio and Workstation expose the same zero-save preflight",()=>{
  const studio=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicRecordingStudioPanel.jsx","utf8");
  const overdub=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx","utf8");
  assert.match(studio,/runMusicRecordingPreflight/);
  assert.match(studio,/Run preflight/);
  assert.match(studio,/nothing saved/);
  assert.match(overdub,/runMusicRecordingPreflight/);
  assert.match(overdub,/Run 4s preflight/);
  assert.match(overdub,/Diagnostic PCM is discarded/);
  assert.match(overdub,/setRecordingPreflight\(null\).*setPreflightPhase\("IDLE"\)/s);
});
