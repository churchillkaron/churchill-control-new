import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bridge = fs.readFileSync(
  new URL("../lib/operator/secretary/SecretaryBusinessAgreementExecutionRuntime.js", import.meta.url),
  "utf8",
);
const messages = fs.readFileSync(
  new URL("../lib/operator/secretary/SecretaryMessageConversationRuntime.js", import.meta.url),
  "utf8",
);
const calls = fs.readFileSync(
  new URL("../lib/operator/secretary/SecretaryCallerConversationRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919050439_agreement_execution_bridge.sql", import.meta.url),
  "utf8",
);

test("agreement execution is durable, server-only and replay keyed", () => {
  assert.match(migration, /business_agreement_executions/);
  assert.match(migration, /unique \(organization_id, source_key\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* from anon, authenticated/i);
  assert.match(bridge, /existingAgreement\(organizationId, key\)/);
  assert.match(bridge, /prior\?\.status === "EXECUTED"/);
});

test("pest-control agreement must prove all execution facts", () => {
  for (const fact of [
    "explicit_customer_agreement",
    "customer_name",
    "customer_phone",
    "customer_address",
    "canonical_customer_relationship",
    "scheduled_start",
    "customer_site",
    "service_name",
    "exact_active_treatment_protocol",
    "booking_confirmation_authority",
  ]) assert.match(bridge, new RegExp(fact));
  assert.match(bridge, /business_agreement_explicit === true/);
  assert.match(bridge, /status: "BLOCKED"/);
});

test("confirmed one-off pest booking enters canonical service execution", () => {
  assert.match(bridge, /createServicePlan/);
  assert.match(bridge, /generateNextServiceVisit/);
  assert.match(bridge, /industry_key: "pest_control"/);
  assert.match(bridge, /contract_end: new Date\(startsAt\)\.toISOString\(\)/);
  assert.match(bridge, /permissions: \["operations\.\*"\]/);
});

test("message secretary collects exact customer identity before pest-control booking", () => {
  assert.match(messages, /known_customer_identity/);
  assert.match(messages, /customer_name/);
  assert.match(messages, /customer_phone/);
  assert.match(messages, /customer_address/);
  assert.match(messages, /use CLARIFY and ask only for the missing fact/);
  assert.match(messages, /Never invent a protocol, service, site, identity, phone, address, price, currency, or agreement/);
  assert.match(bridge, /persistMessageCustomerFacts/);
  assert.match(bridge, /display_name:/);
  assert.match(bridge, /phone:/);
  assert.match(bridge, /address:/);
});

test("message and call secretary paths classify and invoke business execution", () => {
  for (const source of [messages, calls]) {
    assert.match(source, /business_booking_type/);
    assert.match(source, /business_agreement_explicit/);
    assert.match(source, /PEST_CONTROL_SERVICE/);
    assert.match(source, /executeSecretaryBusinessAgreement/);
    assert.match(source, /loadSecretaryBusinessBookingContext/);
  }
});

test("confirmed booking may atomically promote an existing contact into canonical customer relationship", () => {
  assert.match(bridge, /upsertCustomerParty/);
  assert.match(bridge, /promoteContactToCustomer/);
  assert.match(bridge, /party_id: party\.id/);
  assert.match(bridge, /marketing_opt_in: false/);
  assert.match(bridge, /if \(!missing\.length && !customer && contactPartyId\)/);
});

test("blocked agreements create one idempotent internal resolution task", () => {
  assert.match(migration, /secretary_tasks_business_agreement_source_uidx/);
  assert.match(bridge, /ensureResolutionTask/);
  assert.match(bridge, /business_agreement_source_key/);
  assert.match(bridge, /Resolve confirmed customer booking/);
  assert.match(bridge, /completeResolutionTask/);
});

test("business booking classification is restricted to supplied active protocols", () => {
  assert.match(bridge, /industryKey: "pest_control"/);
  assert.match(bridge, /status: "active"/);
  assert.match(bridge, /resolveTemplate/);
  assert.match(messages, /Never invent a protocol, service, site, identity, phone, address, price, currency, or agreement/);
  assert.match(calls, /Never invent any of these/);
});
