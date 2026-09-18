import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateRecordedTakeProbe } from "../lib/creative/music/runtime/CreativeMusicRecordedTakeVerificationContract.js";

const route = fs.readFileSync("app/api/creative/music/auto-studio/route.js", "utf8");

const good = { duration_seconds: 3.5, format_name: "wav", codec_name: "pcm_s24le", sample_rate: 48000, channels: 1, bits_per_raw_sample: 24, sample_format: "s32" };
const declared = { duration_seconds: 3.5, sample_rate: 48000, channels: 1 };

test("server verification accepts exact 24-bit WAV truth",()=>{
  const result=validateRecordedTakeProbe(good,declared);
  assert.equal(result.verified,true);
  assert.equal(result.contract,"AVANTIQO_MUSIC_RECORDED_TAKE_SERVER_VERIFICATION_V1");
  assert.equal(result.bit_depth,24);
});

test("server verification fails closed on material recording metadata mismatch",()=>{
  assert.throws(()=>validateRecordedTakeProbe({...good,sample_rate:44100},declared),/SAMPLE_RATE_MISMATCH/);
  assert.throws(()=>validateRecordedTakeProbe({...good,channels:2},declared),/CHANNEL_COUNT_MISMATCH/);
  assert.throws(()=>validateRecordedTakeProbe({...good,duration_seconds:3.7},declared),/DURATION_MISMATCH/);
  assert.throws(()=>validateRecordedTakeProbe({...good,codec_name:"pcm_s16le",bits_per_raw_sample:16},declared),/WAV_24BIT_REQUIRED/);
});

test("recorded asset creation is gated by server media verification",()=>{
  assert.match(route,/await verifyRecordedTakeUpload/);
  assert.ok(route.indexOf("await verifyRecordedTakeUpload") < route.indexOf("const asset = await CreativeAssetsRuntime.create"));
  assert.match(route,/server_media_verified/);
  assert.match(route,/server_media_checksum_sha256/);
  assert.match(route,/duration_seconds: serverVerification.duration_seconds/);
  assert.match(route,/sample_rate: serverVerification.sample_rate/);
  assert.match(route,/channels: serverVerification.channels/);
});
