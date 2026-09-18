import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { detectLatencyCalibrationReturn, evaluateMusicLatencyCalibrationReuse } from "../lib/creative/music/client/MusicLatencyCalibrationRuntime.js";

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
  assert.match(runtime,/AVANTIQO_MUSIC_LATENCY_CALIBRATION_V3/);
  assert.match(runtime,/HARDWARE_LOOPBACK/);
  assert.match(runtime,/ACOUSTIC_PATH/);
  assert.match(runtime,/automatic_apply_allowed: direct && confidencePassed && physicalLoopbackAttested/);
  assert.match(runtime,/context.setSinkId/);
  assert.match(runtime,/explicitOutputVerified/);
  assert.match(runtime,/microphone_roundtrip_latency_measured: direct && confidencePassed && physicalLoopbackAttested/);
});

test("Workstation requires explicit apply action before measured latency changes offset",()=>{
  assert.match(panel,/Run latency calibration/);
  assert.match(panel,/Use \{latencyCalibration.roundtrip_latency_ms.toFixed\(1\)\} ms offset/);
  assert.match(panel,/function applyMeasuredLatency/);
  assert.match(panel,/latency_calibration: latencyCalibration/);
  assert.match(panel,/automatic_latency_compensation_allowed: false/);
});


test("persisted calibration is reusable only for fresh exact hardware scope",()=>{
  const now=Date.now();
  const calibration={status:"MEASURED",automatic_apply_allowed:true,input_device_id:"mic-a",sample_rate:48000,path_type:"HARDWARE_LOOPBACK",output_sink_id:"out-a",measured_at:new Date(now-1000).toISOString()};
  const ok=evaluateMusicLatencyCalibrationReuse(calibration,{input_device_id:"mic-a",sample_rate:48000,path_type:"HARDWARE_LOOPBACK",output_sink_id:"out-a"},now);
  assert.equal(ok.reuse_allowed,true);
  const changed=evaluateMusicLatencyCalibrationReuse(calibration,{input_device_id:"mic-b",sample_rate:48000,path_type:"HARDWARE_LOOPBACK",output_sink_id:"out-a"},now);
  assert.equal(changed.reuse_allowed,false); assert.ok(changed.reasons.includes("INPUT_DEVICE_CHANGED"));
  const unknownOutput=evaluateMusicLatencyCalibrationReuse(calibration,{input_device_id:"mic-a",sample_rate:48000,path_type:"HARDWARE_LOOPBACK",output_sink_id:null},now);
  assert.equal(unknownOutput.reuse_allowed,false); assert.ok(unknownOutput.reasons.includes("OUTPUT_PATH_UNVERIFIED"));
});

test("Workstation persists calibration evidence locally but blocks stale reuse",()=>{
  assert.match(panel,/loadPersistedMusicLatencyCalibration/);
  assert.match(panel,/persistMusicLatencyCalibration/);
  assert.match(panel,/evaluateMusicLatencyCalibrationReuse/);
  assert.match(panel,/stored calibration not reusable/);
  assert.match(panel,/calibrationReuse\?\.reuse_allowed !== true/);
  assert.match(panel,/System default · calibration not reusable/);
  assert.match(panel,/outputDeviceId: outputDeviceId \|\| null/);
});


test("calibration reuse tolerates rotated device id only when hardware group still matches",()=>{
  const now=Date.now();
  const calibration={status:"MEASURED",automatic_apply_allowed:true,input_device_id:"old-id",input_group_id:"group-a",sample_rate:48000,path_type:"HARDWARE_LOOPBACK",output_sink_id:"out-a",measured_at:new Date(now-1000).toISOString()};
  const rotated=evaluateMusicLatencyCalibrationReuse(calibration,{input_device_id:"new-id",input_group_id:"group-a",sample_rate:48000,path_type:"HARDWARE_LOOPBACK",output_sink_id:"out-a"},now);
  assert.equal(rotated.reuse_allowed,true);
  assert.equal(rotated.same_input_id,false);
  assert.equal(rotated.same_input_group,true);
  const changed=evaluateMusicLatencyCalibrationReuse(calibration,{input_device_id:"new-id",input_group_id:"group-b",sample_rate:48000,path_type:"HARDWARE_LOOPBACK",output_sink_id:"out-a"},now);
  assert.equal(changed.reuse_allowed,false);
  assert.ok(changed.reasons.includes("INPUT_HARDWARE_GROUP_CHANGED"));
});

test("Workstation refreshes device identity on browser devicechange",()=>{
  assert.match(panel,/addEventListener\?\.\("devicechange", refresh\)/);
  assert.match(panel,/removeEventListener\?\.\("devicechange", refresh\)/);
  assert.match(panel,/setInputGroupId/);
  assert.match(panel,/input_group_id: inputGroupId \|\| null/);
});


test("exact hardware latency requires physical-loopback acknowledgement and repeated stable returns",()=>{
  assert.match(runtime,/scheduledStartTimes = \[0.45,0.78,1.11\]/);
  assert.match(runtime,/repeatabilityPassed/);
  assert.match(runtime,/maxDeviation<=1.5/);
  assert.match(runtime,/hardwareLoopbackConfirmed===true/);
  assert.match(panel,/I physically connected the selected output directly to the selected input/);
  assert.match(panel,/!hardwareLoopbackConfirmed/);
  assert.match(panel,/repeatability/);
});
