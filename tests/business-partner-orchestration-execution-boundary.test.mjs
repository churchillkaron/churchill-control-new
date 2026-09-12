import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createOperatorExecutionBoundary,
  normalizeOperatorExecutionBoundary,
} from "../lib/operator/runtime/OperatorExecutionBoundaryRuntime.mjs";

test("execution boundary is non-authorizing and non-replayable", () => {
  const boundary = createOperatorExecutionBoundary();
  assert.equal(boundary.contract, "AVANTIQO_OPERATOR_EXECUTION_BOUNDARY_V1");
  assert.equal(boundary.business_record_verification_required, false);
  assert.equal(boundary.mutation_replay_authority, false);
  assert.equal(boundary.authorization_effect, "NONE");
});

test("invalid execution boundary declarations fail closed", () => {
  assert.equal(normalizeOperatorExecutionBoundary({ contract: "wrong" }), null);
  assert.equal(normalizeOperatorExecutionBoundary({ ...createOperatorExecutionBoundary(), mutation_replay_authority: true }), null);
  assert.equal(normalizeOperatorExecutionBoundary({ ...createOperatorExecutionBoundary(), authorization_effect: "WRITE" }), null);
});

test("catalog exposes normalized execution boundary independently of business verifier", () => {
  const src = fs.readFileSync("lib/operator/runtime/OperatorCapabilityCatalog.js", "utf8");
  assert.match(src, /operator_execution_boundary_status/);
  assert.match(src, /normalizeOperatorExecutionBoundary/);
  assert.doesNotMatch(src, /key\.startsWith\("creative\."\).*operator_execution_boundary/);
});

test("true orchestration is explicitly wrapped at domain registration", () => {
  const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
  const domains = fs.readFileSync("lib/ubte/runtime/domains/DomainRuntimeRegistry.js", "utf8");
  const creative = fs.readFileSync("lib/creative/runtime/CreativeRuntime.js", "utf8");
  for (const key of ["product_persistence_handoff", "product_engineering_cycle", "product_production_release", "business_partner_external_wait", "code_ai_mission", "code_ai_autonomous", "code_ai_commit", "operator_mission"]) {
    assert.match(platform, new RegExp(`${key}:[\\s\\S]*withOperatorExecutionBoundary`));
  }
  assert.match(domains, /withOperatorExecutionBoundary\(portfolioModule\.createProductEngineeringPortfolioCapability/);
  assert.match(domains, /withOperatorExecutionBoundary\(portfolioControlModule\.createProductEngineeringPortfolioControlCapability/);
  assert.equal((creative.match(/loadWithOperatorExecutionBoundary/g) || []).length, 6);
});

test("write coverage cert no longer treats creative code product mission prefixes as sufficient", () => {
  const cert = fs.readFileSync("scripts/certify-business-partner-write-verification-coverage-local.mjs", "utf8");
  assert.match(cert, /true_orchestration_requires_explicit_execution_boundary/);
  assert.match(cert, /operator_execution_boundary_status===\"EXPLICIT_VALID\"/);
  assert.match(cert, /remaining_unverified_are_secretary_records_only/);
});
