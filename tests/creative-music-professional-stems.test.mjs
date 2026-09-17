import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalStemRuntime.js", "utf8");
const production = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalProductionRuntime.js", "utf8");

test("professional stem runtime uses certified owned stem capability and persists four-stem lineage", () => {
  assert.match(source, /buildMusicTransformationPlan\("stems"/);
  assert.match(source, /capability:plan\.capability/);
  assert.match(source, /allowed_providers:\["avantiqo-audio"\]/);
  assert.match(source, /STEM_KEYS = Object\.freeze\(\["vocals", "drums", "bass", "other"\]\)/);
  assert.match(source, /asset_type:"MUSIC_STEM"/);
  assert.match(source, /professional_stem_usage_id/);
});

test("professional stem import is non destructive and idempotent by source asset", () => {
  assert.match(source, /existingSourceIds/);
  assert.match(source, /if\(existingSourceIds\.has\(text\(asset\.id\)\)\) continue/);
  assert.match(source, /createMusicClip\(\{ source_asset_id:asset\.id/);
  assert.match(source, /validateMusicMultitrackProject\(next\)/);
  assert.match(source, /validateMusicMixerRouting\(next\)/);
  assert.match(source, /professional_stems_ready:assets\.length>=2/);
});

test("professional production controller keeps stem separation before vocal and mix stages", () => {
  const stem = production.indexOf('["STEM_SEPARATION"');
  const vocal = production.indexOf('["VOCAL_PRODUCTION"');
  const mix = production.indexOf('["MIX_ENGINEERING"');
  assert.ok(stem > -1 && vocal > stem && mix > vocal);
});

test("professional continuation requires exact current-stage authority", () => {
  const continuation = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js", "utf8");
  assert.match(continuation, /text\(input\.authorized_stage\)!==text\(next\.stage_id\)/);
  assert.match(continuation, /status:"AUTHORIZATION_REQUIRED"/);
  assert.match(continuation, /next\.stage_id==="STEM_SEPARATION"/);
});

test("completed stems write evidence back to source asset before advancing", () => {
  assert.match(source, /CreativeAssetsRuntime\.update\(sourceAssetId/);
  assert.match(source, /professional_stems_ready:stems\.length>=2/);
  assert.match(source, /professional_stems:stems\.map\(a=>a\.id\)/);
});
