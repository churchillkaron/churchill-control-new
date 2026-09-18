import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMusicPictureLock, bindMusicSessionToPicture, evaluateMusicPictureLock, musicSecondsToFrames, musicSecondsToSmpte } from "../lib/creative/music/runtime/CreativeMusicPictureLockRuntime.js";

test("audio-for-picture binds exact picture identity and frame clock",()=>{const picture={picture_asset_id:"vid1",cut_id:"cut7",picture_digest:"abc123",duration_seconds:60,frame_rate:24};const lock=createMusicPictureLock(picture);assert.equal(lock.contract,"AVANTIQO_MUSIC_PICTURE_LOCK_V1");assert.equal(lock.frame_count,1440);assert.equal(lock.sync_tolerance_frames,1);const session=bindMusicSessionToPicture({timeline:{}},picture);assert.equal(session.timeline.timebase,"PICTURE_FRAMES");assert.equal(session.timeline.picture_lock_digest,lock.picture_lock_digest);});
test("picture change makes audio lock stale instead of silently drifting",()=>{const picture={picture_asset_id:"vid1",cut_id:"cut7",picture_digest:"abc123",duration_seconds:60,frame_rate:24};const session=bindMusicSessionToPicture({},picture);assert.equal(evaluateMusicPictureLock(session,picture).current,true);const changed={...picture,cut_id:"cut8",picture_digest:"def456",duration_seconds:60.5};const status=evaluateMusicPictureLock(session,changed);assert.equal(status.status,"STALE");assert.ok(status.reasons.includes("PICTURE_CUT_CHANGED"));assert.ok(status.reasons.includes("PICTURE_DIGEST_CHANGED"));assert.equal(status.reconform_required,true);});
test("SMPTE helpers keep audio cues on picture frames",()=>{assert.equal(musicSecondsToFrames(2.5,24),60);assert.equal(musicSecondsToSmpte(2.5,24),"00:00:02:12");});


test("spatial azimuth automation moves a point source through discrete speakers smoothly",async()=>{
  const { mixMusicTrackIntoSpatialChannelsAutomated }=await import("../lib/creative/music/client/MusicSpatialMixMathRuntime.js");
  const frames=4800,src=new Float32Array(frames).fill(.25),lane={parameter:"spatial:azimuth_degrees",enabled:true,interpolation:"linear",points:[{time_seconds:0,value:-110},{time_seconds:.1,value:110}]};
  const out=mixMusicTrackIntoSpatialChannelsAutomated({layout:"5.1",left:src,right:src,spatial:{mode:"POINT",azimuth_degrees:-110,divergence_percent:0,lfe_send_db:-120},sample_rate:48000,automation_lanes:[lane]});
  assert.equal(out.length,6);
  assert.ok(Math.abs(out[4][50])>Math.abs(out[5][50]));
  assert.ok(Math.abs(out[5][4700])>Math.abs(out[4][4700]));
  const centerEnergy=out[2].reduce((sum,v)=>sum+Math.abs(v),0);assert.ok(centerEnergy>0);
});

test("surround renderer consumes spatial lanes rather than blocking them",()=>{
  const renderer=fs.readFileSync("lib/creative/music/client/MusicOfflineSurroundRenderRuntime.js","utf8");
  assert.doesNotMatch(renderer,/SURROUND_SPATIAL_AUTOMATION_NOT_CERTIFIED/);
  assert.match(renderer,/mixMusicTrackIntoSpatialChannelsAutomated/);
  assert.match(renderer,/spatial_movement_automation_supported: true/);
});


test("Workstation exposes editable picture-locked spatial automation lanes",()=>{
  const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicAutomationPanel.jsx","utf8");
  const runtime=fs.readFileSync("lib/creative/music/runtime/CreativeMusicAutomationRuntime.js","utf8");
  assert.match(runtime,/AVANTIQO_MUSIC_MIXER_AUTOMATION_V2/);
  assert.match(runtime,/spatial:azimuth_degrees/);
  assert.match(runtime,/spatial:width_percent/);
  assert.match(runtime,/spatial:divergence_percent/);
  assert.match(panel,/Picture-locked spatial automation/);
  assert.match(panel,/Spatial azimuth/);
  assert.match(panel,/stereo browser preview does not claim/);
});
