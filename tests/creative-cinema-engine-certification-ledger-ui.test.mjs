import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ledger = fs.readFileSync(
  "lib/creative/certification/runtime/CreativeCinemaEngineCertificationLedgerRuntime.js",
  "utf8",
);
const route = fs.readFileSync(
  "app/api/creative/cinema/certification/route.js",
  "utf8",
);
const mission = fs.readFileSync(
  "components/creative/ProductionStudio/status/CreativeMissionControlPanel.jsx",
  "utf8",
);
const motion = fs.readFileSync(
  "lib/creative/motion-graphics/runtime/CreativeCinematicMotionDesignRenderRuntime.js",
  "utf8",
);

test("Cinema engine evidence is persisted in project-scoped metadata", () => {
  assert.match(ledger, /cinema_engine_certification_ledger/);
  assert.match(ledger, /CreativeProjectRepository\.update/);
  assert.match(ledger, /revision: current\.revision \+ 1/);
  assert.match(ledger, /evidence_hash: hash\(body\)/);
});
test("ledger refuses unsupported proof claims without durable references", () => {
  assert.match(ledger, /CINEMA_ENGINE_TECHNICAL_PROOF_ID_REQUIRED/);
  assert.match(ledger, /CINEMA_ENGINE_VISUAL_PROOF_REFERENCE_REQUIRED/);
  assert.match(ledger, /CINEMA_ENGINE_UNKNOWN/);
});

test("Studio exposes certification through an authenticated read-only route", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /CreativeCinemaEngineCertificationLedgerRuntime\.inspect/);
  assert.equal(route.includes("export async function POST"), false);
});

test("Mission Control renders per-engine technical and visual state", () => {
  assert.match(mission, /Professional Cinema Engines/);
  assert.match(mission, /cinemaCertification\.engines/);
  assert.match(mission, /engine\.technical_passed/);
  assert.match(mission, /engine\.visual_passed/);
  assert.match(mission, /Missing proof stays blocked/);
});

test("real cinematic motion render records technical proof but not visual certification", () => {
  assert.match(motion, /CreativeCinemaEngineCertificationLedgerRuntime\.record/);
  assert.match(motion, /engine_id:"CINEMATIC_MOTION"/);
  assert.match(motion, /technical_proof_passed:true/);
  assert.match(motion, /visual_proof_passed:false/);
  assert.match(motion, /proof_checksum:proofChecksum/);
});
