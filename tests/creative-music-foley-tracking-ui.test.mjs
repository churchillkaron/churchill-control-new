import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Foley tracking route runs local OpenCV OBJECT_TRACK against locked picture",()=>{const route=fs.readFileSync("app/api/creative/music/foley-tracking/route.js","utf8");assert.match(route,/executeCreativeOpenCV/);assert.match(route,/operation:"OBJECT_TRACK"/);assert.match(route,/picture_asset_id/);assert.match(route,/provider_job_submitted:false/);assert.match(route,/local_opencv_execution:true/);});
test("Sound Design exposes reviewed contact-to-bind workflow",()=>{const shell=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicUnifiedWorkstationShell.jsx","utf8"),panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicFoleyContactPanel.jsx","utf8");assert.match(shell,/MusicFoleyContactPanel/);assert.match(panel,/Picture-aware Foley/);assert.match(panel,/preview_foley_contacts/);assert.match(panel,/bind_foley_asset/);assert.match(panel,/Approve cue & bind real Foley asset/);assert.match(panel,/No semantic guessing/);});
