import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const repo = fs.readFileSync("lib/platform/service-runtime/usage/repositories/ServiceUsageRepository.js", "utf8");
const billing = fs.readFileSync("lib/platform/service-runtime/billing/runtime/BillingRuntime.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/billing/runtime/ServiceBillingQueueRuntime.js", "utf8");

test("billing reads service usage without provider media metadata", () => {
  assert.match(repo, /BILLING_USAGE_SELECT/);
  assert.doesNotMatch(repo.match(/const BILLING_USAGE_SELECT =[\s\S]*?\.join\(","\);/)?.[0] || "", /metadata/);
  assert.match(billing, /getBillingById\(usage_id\)/);
  assert.doesNotMatch(queue.match(/from\("platform_service_usage"\)[\s\S]{0,220}/)?.[0] || "", /select\("\*"\)/);
});

test("billing invoice line stores compact trace evidence, not usage metadata", () => {
  assert.match(billing, /provider_request_id: usage\.provider_request_id/);
  assert.match(billing, /provider_model: usage\.provider_model/);
  assert.doesNotMatch(billing, /metadata: usage\.metadata/);
});

test("mark invoiced returns the compact billing projection", () => {
  assert.match(repo, /updateBillingState/);
  assert.match(repo, /select\(BILLING_USAGE_SELECT\)/);
});
