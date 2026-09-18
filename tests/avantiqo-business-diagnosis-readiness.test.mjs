import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getBusinessDiagnosisReadiness, assertBusinessDiagnosisReadiness } from "../lib/intelligence/runtime/AvantiqoBusinessDiagnosisReadinessRuntime.js";

const signedEnv = {
  AVANTIQO_BUSINESS_DIAGNOSIS_AUTHENTICITY_REQUIRED: "true",
  AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID: "k1",
  AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON: JSON.stringify({ k1: "11".repeat(32) }),
};

test("diagnosis readiness is operational when authenticity is optional", () => {
  const readiness = getBusinessDiagnosisReadiness({ env: {} });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, "READY_STRUCTURAL_UNSIGNED");
  assert.equal(readiness.authority_effect, "NONE");
});

test("diagnosis readiness blocks when authenticity is required but keyring is absent", () => {
  const env = { AVANTIQO_BUSINESS_DIAGNOSIS_AUTHENTICITY_REQUIRED: "true" };
  const readiness = getBusinessDiagnosisReadiness({ env });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "BLOCKED_AUTHENTICITY_REQUIRED");
  assert.ok(readiness.blockers.length > 0);
  assert.throws(() => assertBusinessDiagnosisReadiness({ env }), (error) => error.code === "BUSINESS_DIAGNOSIS_NOT_READY" && error.status === 503);
});

test("diagnosis readiness becomes authenticated when configured", () => {
  const readiness = getBusinessDiagnosisReadiness({ env: signedEnv });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, "READY_AUTHENTICATED");
  assert.equal(readiness.proof.active_key_id, "k1");
  assert.deepEqual(readiness.proof.verification_key_ids, ["k1"]);
});

test("readiness endpoint is authenticated organization-scoped and no-store", () => {
  const route = fs.readFileSync("app/api/platform/intelligence/business/readiness/route.js", "utf8");
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /organization_id required/);
  assert.match(route, /getBusinessDiagnosisReadiness/);
  assert.match(route, /status: readiness\.ready \? 200 : 503/);
  assert.match(route, /cache-control.*no-store/s);
});

test("both direct API and Business Partner preflight readiness before diagnosis execution", () => {
  const api = fs.readFileSync("app/api/platform/intelligence/business/route.js", "utf8");
  const partner = fs.readFileSync("lib/operator/runtime/BusinessPartnerBusinessDiagnosisRuntime.js", "utf8");
  assert.match(api, /assertBusinessDiagnosisReadiness\(\)/);
  assert.match(api, /BUSINESS_DIAGNOSIS_NOT_READY/);
  assert.match(partner, /assertBusinessDiagnosisReadiness\(\)/);
  assert.ok(partner.indexOf("assertBusinessDiagnosisReadiness()") < partner.indexOf("runDiagnosis({"));
});
