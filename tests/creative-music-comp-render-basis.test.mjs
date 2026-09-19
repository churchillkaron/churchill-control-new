import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { musicCompRenderBasis } from "../lib/creative/music/runtime/CreativeMusicCompingRuntime.js";

const renderer=fs.readFileSync("lib/creative/music/client/MusicCompRender.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicTakeLaneCompPanel.jsx","utf8");
const route=fs.readFileSync("app/api/creative/music/comp-render/route.js","utf8");

test("canonical comp render basis includes timing, source offsets, gain and fades",()=>{
  const basis=musicCompRenderBasis({id:"c1",track_id:"t1",start_seconds:0,end_seconds:2,duration_seconds:2,crossfade_default_seconds:.015,regions:[{id:"r1",take_id:"take1",source_asset_id:"a1",start_seconds:0,end_seconds:2,source_offset_seconds:.025,gain_db:-1,fade_in_seconds:.01,fade_out_seconds:.02}]});
  assert.equal(basis.contract,"AVANTIQO_MUSIC_COMP_RENDER_BASIS_V1");
  assert.equal(basis.regions[0].source_offset_seconds,.025);
  assert.equal(basis.regions[0].gain_db,-1);
  assert.equal(basis.regions[0].fade_out_seconds,.02);
});

test("browser submits the exact basis rendered and server fails closed on mismatch",()=>{
  assert.match(renderer,/render_basis: musicCompRenderBasis\(comp\)/);
  assert.match(panel,/render_basis: rendered.render_basis/);
  assert.match(route,/musicCompRenderBasis\(track.comp\)/);
  assert.match(route,/CREATIVE_MUSIC_COMP_RENDER_BASIS_MISMATCH/);
  assert.match(route,/CREATIVE_MUSIC_COMP_RENDER_DURATION_MISMATCH/);
  assert.match(route,/render_basis_verified: true/);
});
