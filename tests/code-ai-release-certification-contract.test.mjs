import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const certification = await readFile(new URL("../lib/platform/capabilities/createCodeAIReleaseCertificationCapability.js", import.meta.url), "utf8");
const studio = await readFile(new URL("../components/creative/code/CreativeCodeStudio.jsx", import.meta.url), "utf8");
const release = await readFile(new URL("../lib/platform/capabilities/createProductProductionReleaseCapability.js", import.meta.url), "utf8");
const vercel = await readFile(new URL("../lib/platform/runtime/AvantiqoProductionReleaseRuntime.js", import.meta.url), "utf8");

test("release certification binds exact review SHA to READY Vercel evidence and candidate device verification", () => {
  assert.match(certification, /review\.commit_sha/);
  assert.match(certification, /verifyExistingVercelDeployment/);
  assert.match(certification, /deployment\.ready!==true/);
  assert.match(certification, /workspace_target:"DEVICE"/);
  assert.match(certification, /require_accessibility:true/);
  assert.match(certification, /deriveCodeAIShadowComparison/);
  assert.match(certification, /CODE_AI_RELEASE_CERTIFICATION_INVARIANT_FAILED/);
  assert.match(certification, /production_deployed:false/);
  assert.match(certification, /merge_performed:false/);
});

test("release certification requires non-empty replay shadow and invariant proof inputs", () => {
  assert.match(certification, /REQUIRED_PROOF_INPUTS_MISSING/);
  assert.match(certification, /browser_steps:\{type:"array",minItems:1/);
  assert.match(certification, /shadow_paths:\{type:"array",minItems:1/);
  assert.match(certification, /invariant_commands:\{type:"array",minItems:1/);
});

test("release certification returns refreshed Precision state and Studio merges it immediately", () => {
  assert.match(certification, /precision_evidence:precision/);
  assert.match(certification, /engineering_precision_os:refreshedPrecisionOS/);
  assert.match(studio, /certification\.precision_evidence \|\| current\.state\?\.precision_evidence/);
  assert.match(studio, /certification\.engineering_precision_os \|\| current\.state\?\.engineering_precision_os/);
  assert.match(studio, /\/api\/operator\/code\/release-certification/);
  assert.match(studio, /Production E-gate/);
});

test("production release checks E precision before invoking governed commit", () => {
  const gate = release.indexOf("assertCodeAIProductionReleasePrecisionReady");
  const commit = release.indexOf("const committed = await executeUbteCapability");
  assert.ok(gate >= 0 && commit >= 0 && gate < commit);
});

test("Vercel verifier is read-only and exact-commit aware", () => {
  assert.match(vercel, /verifyExistingVercelDeployment/);
  assert.match(vercel, /method: "POST"/); // production creation remains a separate existing function
  const verifyStart = vercel.indexOf("export async function verifyExistingVercelDeployment");
  const verifyEnd = vercel.indexOf("export async function verifyExistingProductionDeployment", verifyStart);
  const verifyBody = vercel.slice(verifyStart, verifyEnd);
  assert.doesNotMatch(verifyBody, /method:\s*"POST"/);
  assert.match(verifyBody, /AVANTIQO_PRODUCTION_RELEASE_COMMIT_MISMATCH/);
});
