import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { detectLatencyCalibrationReturn } from "../lib/creative/music/client/MusicLatencyCalibrationRuntime.js";

const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx","utf8");
const runtime=fs.readFileSync("lib/creative/music/client/MusicLatencyCalibrationRuntime.js","utf8");

function template(frames=512){const a=new Float32Array(frames);let x=123456789;for(let i=0;i<frames;i+=1){x=(1103515245*x+12345)&0x7fffffff;a[i]=((x/0x7fffffff)*2-1)*Math.sin(Math.PI*i/(frames-1));}return a;}

test("correlation detector finds a deterministic loopback return",()=>{
  const t=template(),signal=new Float32Array(5000),offset=1733; signal.set(t,offset);
  const found=detectLatencyCalibrationReturn({signal,template:t,expectedOffsetFrames:1700,searchRadiusFrames:300});
  assert.equal(found.detected,true);
  assert.equal(found.offset_frames,offset);
  assert.ok(found.confidence>.9);
});

test("calibration runtime distinguishes exact hardware loopback from acoustic evidence",()=>{
  assert.match(runtime,/AVANTIQO_MUSIC_LATENCY_CALIBRATION_V1/);
  assert.match(runtime,/HARDWARE_LOOPBACK/);
  assert.match(runtime,/ACOUSTIC_PATH/);
  assert.match(runtime,/automatic_apply_allowed: direct && confidencePassed/);
  assert.match(runtime,/microphone_roundtrip_latency_measured: direct && confidencePassed/);
});

test("Workstation requires explicit apply action before measured latency changes offset",()=>{
  assert.match(panel,/Run latency calibration/);
  assert.match(panel,/Use \{latencyCalibration.roundtrip_latency_ms.toFixed\(1\)\} ms offset/);
  assert.match(panel,/function applyMeasuredLatency/);
  assert.match(panel,/latency_calibration: latencyCalibration/);
  assert.match(panel,/automatic_latency_compensation_allowed: false/);
});
