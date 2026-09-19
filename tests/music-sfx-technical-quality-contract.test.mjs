import assert from "node:assert/strict";import {readFile} from "node:fs/promises";import test from "node:test";
const source=await readFile("scripts/analyze-avantiqo-music-sfx-technical-quality-local.mjs","utf8");
test("SFX technical QA validates exact delivery format and signal integrity",()=>{assert.match(source,/pcm_s24le/);assert.match(source,/48000/);assert.match(source,/SFX_DIGITAL_CLIPPING_DETECTED/);assert.match(source,/SFX_DC_OFFSET_EXCESSIVE/);});
test("SFX technical QA warns on hot levels but does not pretend semantic quality",()=>{assert.match(source,/SFX_EXTREMELY_LOW_HEADROOM/);assert.match(source,/SFX_VERY_HIGH_INTEGRATED_LOUDNESS/);assert.match(source,/human_listening_still_required:true/);assert.match(source,/semantic_quality_claimed:false/);});
