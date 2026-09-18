import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const certification = fs.readFileSync(
  "lib/creative/certification/runtime/CreativeCinemaEngineCertificationRuntime.js",
  "utf8",
);
const cycles = fs.readFileSync(
  "lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js",
  "utf8",
);
const matchmove = fs.readFileSync(
  "lib/creative/tracking/runtime/CreativeOpenCVMatchmoveExecutionRuntime.js",
  "utf8",
);
const roto = fs.readFileSync(
  "lib/creative/roto/runtime/CreativeOpenCVRotoExecutionRuntime.js",
  "utf8",
);

test("certification authority names the executable matchmove and roto contracts", () => {
  assert.match(certification, /CREATIVE_OPENCV_MATCHMOVE_EXECUTION_V1/);
  assert.match(certification, /CREATIVE_OPENCV_ROTO_EXECUTION_V1/);
});
test("Cycles records technical AOV proof without inventing visual approval", () => {
  assert.match(cycles, /engine_id:"CYCLES_AOV_RENDER"/);
  assert.match(cycles, /technical_proof_passed:true/);
  assert.match(cycles, /visual_proof_passed:false/);
  assert.match(cycles, /proofChecksum/);
});

test("matchmove records proof only after 3D authority passes", () => {
  assert.match(matchmove, /authority\.status==="READY"/);
  assert.match(matchmove, /world_space_cgi_allowed===true/);
  assert.match(matchmove, /engine_id:"MATCHMOVE_3D"/);
  assert.match(matchmove, /CreativeMatchmoveAuthorityRuntime\.contract/);
});

test("roto records lossless technical proof but keeps visual review pending", () => {
  assert.match(roto, /engine_id:"ROTO_MATTING"/);
  assert.match(roto, /technical_proof_passed:true/);
  assert.match(roto, /visual_proof_passed:false/);
  assert.match(roto, /CreativeRotoMatteAuthorityRuntime\.contract/);
});
