import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  BUSINESS_PARTNER_LIFECYCLE_CERTIFICATION_CONTRACT,
  certifyBusinessPartnerLifecycle,
} from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

test("lifecycle certification fails closed when any authoritative stage is absent", () => {
  const result = certifyBusinessPartnerLifecycle({
    scenario: "fixture",
    stages: { mission_planning: true },
  });
  assert.equal(result.certified, false);
  assert.equal(result.status, "CERTIFICATION_BLOCKED");
  assert.ok(result.failed_stages.includes("authoritative_replay"));
  assert.equal(result.authorization_effect, "NONE");
});

test("Finance Business Partner lifecycle is structurally certified end to end", () => {
  const run = spawnSync(
    process.execPath,
    ["scripts/certify-business-partner-finance-lifecycle-local.mjs"],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.contract, BUSINESS_PARTNER_LIFECYCLE_CERTIFICATION_CONTRACT);
  assert.equal(report.scenario, "FINANCE_CUSTOMER_INVOICE_TO_PAID_RECEIPT_WITH_SELF_HEALING");
  assert.equal(report.certified, true);
  assert.equal(report.failed_stages.length, 0);
  assert.equal(report.production_writes_performed, false);
  assert.equal(report.production_deploy_performed, false);
  assert.equal(report.database_migrations_applied, false);
});
