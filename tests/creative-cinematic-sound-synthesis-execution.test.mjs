import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("synthesis execution runtime is local non-destructive and writes 24-bit derived audio",()=>{const src=fs.readFileSync("lib/creative/music/runtime/CreativeCinematicSoundSynthesisExecutionRuntime.js","utf8");assert.match(src,/materializeMedia/);assert.match(src,/renderCinematicSoundSynthesisPreview/);assert.match(src,/pcm_s24le/);assert.match(src,/provider_job_submitted:false/);assert.match(src,/source_assets_preserved:true/);assert.match(src,/render_to_new_asset_only:true/);});
test("sound synthesis route scopes every source asset and creates a derived Audio asset",()=>{const route=fs.readFileSync("app/api/creative/music/sound-synthesis/route.js","utf8");assert.match(route,/CINEMATIC_SOUND_SYNTH_SOURCE_ASSET_SCOPE_MISMATCH/);assert.match(route,/CreativeAssetsRuntime.create/);assert.match(route,/CINEMATIC_SOUND_SYNTHESIS_RENDER/);assert.match(route,/endpoint_mutation_performed:true/);assert.match(route,/release_master:false/);});
test("Advanced Sound Design exposes real 24-bit synthesis render",()=>{const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicAdvancedSoundDesignPanel.jsx","utf8");assert.match(panel,/\/api\/creative\/music\/sound-synthesis/);assert.match(panel,/Render 24-bit synthesis asset/);assert.match(panel,/Derived synthesis asset/);});
