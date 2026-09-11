import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBusinessPartnerDataRecoveryState,
  applyBusinessPartnerDataRecoveryReply,
} from "../lib/operator/runtime/BusinessPartnerDataRecoveryRuntime.mjs";

const synthetic = await readFile("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
const core = await readFile("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

function capability(required, properties) {
  return {
    key: "finance.customer_invoices.create",
    input_schema: { required, properties },
  };
}

function recovery(payload = {}) {
  return {
    capability: { key: "finance.customer_invoices.create" },
    payload,
    authorization_effect: "SAME_ACTION_ONLY",
  };
}

test("data recovery asks only for missing non-context schema fields", () => {
  const state = createBusinessPartnerDataRecoveryState({
    recovery: recovery({ customer_id: "c1" }),
    capability: capability(["organization_id", "customer_id", "currency"], {
      organization_id: { type: "string" }, customer_id: { type: "string" }, currency: { type: "string", enum: ["THB", "USD"] },
    }),
    repair: { question: "Which currency should I use?" },
  });
  assert.deepEqual(state.missing_required_fields, ["currency"]);
  assert.match(state.question, /currency/i);
  assert.equal(state.authorization_effect, "NONE");
});
test("single missing field accepts a direct typed value", () => {
  const cap = capability(["currency"], { currency: { type: "string", enum: ["THB", "USD"] } });
  const state = createBusinessPartnerDataRecoveryState({ recovery: recovery(), capability: cap, repair: {} });
  const applied = applyBusinessPartnerDataRecoveryReply({ state, capability: cap, message: "THB" });
  assert.equal(applied.accepted, true);
  assert.equal(applied.complete, true);
  assert.equal(applied.payload.currency, "THB");
  assert.equal(applied.state.payload_validated, true);
  assert.equal(applied.state.auto_resume_allowed, true);
});

test("multiple fields require explicit requested assignments and preserve partial progress", () => {
  const cap = capability(["currency", "exchange_rate"], {
    currency: { type: "string", enum: ["THB", "USD"] }, exchange_rate: { type: "number" },
  });
  const state = createBusinessPartnerDataRecoveryState({ recovery: recovery(), capability: cap, repair: {} });
  const partial = applyBusinessPartnerDataRecoveryReply({ state, capability: cap, message: "currency = USD" });
  assert.equal(partial.accepted, true);
  assert.equal(partial.complete, false);
  assert.equal(partial.payload.currency, "USD");
  assert.deepEqual(partial.state.missing_required_fields, ["exchange_rate"]);
  const completed = applyBusinessPartnerDataRecoveryReply({ state: partial.state, capability: cap, message: "36.5" });
  assert.equal(completed.complete, true);
  assert.equal(completed.payload.exchange_rate, 36.5);
});

test("unrequested fields and changed schemas are rejected", () => {
  const cap = capability(["currency"], { currency: { type: "string" } });
  const state = createBusinessPartnerDataRecoveryState({ recovery: recovery(), capability: cap, repair: {} });
  const unrequested = applyBusinessPartnerDataRecoveryReply({ state, capability: cap, message: "amount = 100" });
  assert.equal(unrequested.accepted, false);
  const changed = capability(["currency", "amount"], { currency: { type: "string" }, amount: { type: "number" } });
  assert.equal(applyBusinessPartnerDataRecoveryReply({ state, capability: changed, message: "THB" }).reason, "CAPABILITY_INPUT_SCHEMA_CHANGED");
});
test("data completion resumes only the exact failed action through normal governance", () => {
  assert.match(synthetic, /data_recovery_same_action_only:\s*true/);
  assert.match(synthetic, /confirmation_reused:\s*false/);
  assert.match(synthetic, /approval_reused:\s*false/);
  assert.match(synthetic, /message:\s*"continue"/);
  assert.match(synthetic, /source:\s*"event"/);
  assert.match(core, /AVANTIQO_BUSINESS_PARTNER_DATA_RECOVERY_V1/);
  assert.match(core, /Resume exact original action after required business data was supplied/);
  assert.match(core, /executionBlockedReason\(capability, \{ source, confirmed: false \}\)/);
});

test("recovery confirmation preserves original mission run", () => {
  assert.match(core, /preserveRecoveryMission/);
  assert.match(core, /resume_kind:\s*"business_partner_recovery"/);
  assert.match(core, /text\(activeRun\?\.run_id\) === text\(recoveryContinuity\.run_id\)/);
  assert.match(synthetic, /data_fields_amended_only/);
  assert.match(synthetic, /planned_steps:\s*list\(continuity\.planned_steps\)\.map/);
  assert.match(synthetic, /planned_steps:\s*list\(activeRun\.planned_steps\)\.map/);
});

test("data recovery is separate from Code replay verification", () => {
  assert.match(core, /if \(!dataRecoveryResume\) \{/);
  assert.match(core, /data_recovery_receipt/);
  assert.match(core, /status:\s*"DATA_RETRY_VERIFIED"/);
  assert.match(core, /businessPartnerDataMissionResume:\s*true/);
});
