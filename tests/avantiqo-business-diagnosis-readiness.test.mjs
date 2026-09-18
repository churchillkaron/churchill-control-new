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


test("operator route surfaces diagnosis readiness failure with structured details",()=>{
  const route=fs.readFileSync("app/api/operator/turn/route.js","utf8");
  assert.match(route,/BUSINESS_DIAGNOSIS_NOT_READY/);
  assert.match(route,/Business diagnosis is not ready/);
  assert.match(route,/error\.details/);
});

test("live transport emits diagnosis-not-ready instead of generic turn failure",()=>{
  const live=fs.readFileSync("app/api/operator/turn/live/route.js","utf8");
  assert.match(live,/DIAGNOSIS_NOT_READY/);
  assert.match(live,/diagnosis_not_ready:/);
  assert.match(live,/readiness_status:/);
  assert.match(live,/required proof authenticity is not ready/);
});

test("both operator clients preserve readiness details and show a governed no-analysis message",()=>{
  for(const file of ["components/operator/HomeAvantiqoIntelligence.jsx","components/operator/AvantiqoOperator.jsx"]){
    const source=fs.readFileSync(file,"utf8");
    assert.match(source,/BUSINESS_DIAGNOSIS_NOT_READY/);
    assert.match(source,/result\?\.details\?\.readiness_status/);
    assert.match(source,/required proof authenticity is not ready/);
    assert.match(source,/No analysis or action was executed/);
    assert.match(source,/governedDiagnosisFailure/);
  }
});


test("system health exposes sanitized business diagnosis readiness and degrades when required authenticity is blocked",()=>{
  const health=fs.readFileSync("lib/health/checkSystemHealth.js","utf8");
  assert.match(health,/getBusinessDiagnosisReadiness/);
  assert.match(health,/business_diagnosis:/);
  assert.match(health,/authenticity_required:/);
  assert.match(health,/authenticity_available:/);
  assert.match(health,/blocker_count:/);
  assert.match(health,/diagnosisOperational/);
  assert.match(health,/healthy = databaseHealthy && queueOperational && diagnosisOperational/);
});

test("platform operator raises a dedicated business diagnosis readiness signal",()=>{
  const operator=fs.readFileSync("lib/platform/operator/buildPlatformOperatorControl.js","utf8");
  assert.match(operator,/business-diagnosis-readiness/);
  assert.match(operator,/Business Diagnosis is not ready/);
  assert.match(operator,/required diagnosis-proof authenticity is not operational/i);
  assert.match(operator,/target: "business_diagnosis"/);
  assert.match(operator,/authorityEffect: "NONE"/);
});


test("public system health redacts diagnosis security posture",()=>{
  const route=fs.readFileSync("app/api/health/system/route.js","utf8");
  assert.match(route,/function publicSystemHealth/);
  assert.match(route,/status: diagnosis\.ready === true \? "available" : "unavailable"/);
  assert.match(route,/ready: diagnosis\.ready === true/);
  assert.doesNotMatch(route,/authenticity_required:/);
  assert.doesNotMatch(route,/authenticity_available:/);
  assert.doesNotMatch(route,/blocker_count:/);
  assert.match(route,/cache-control.*no-store/s);
});

test("internal system health still retains detailed diagnosis readiness for authenticated operator control",()=>{
  const health=fs.readFileSync("lib/health/checkSystemHealth.js","utf8");
  assert.match(health,/authenticity_required:/);
  assert.match(health,/authenticity_available:/);
  assert.match(health,/blocker_count:/);
  const platform=fs.readFileSync("app/(system)/platform/page.jsx","utf8");
  assert.match(platform,/requirePlatformAdminAccess/);
  assert.match(platform,/checkSystemHealth\(\)/);
});
