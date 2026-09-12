import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBusinessPartnerHumanGateRecoveryState,
  humanGateResolutionReply,
  authorizeBusinessPartnerHumanGateReinspection,
} from "../lib/operator/runtime/BusinessPartnerHumanGateRecoveryRuntime.mjs";

const synthetic = await readFile("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
const core = await readFile("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

const recovery = {
  capability: { key: "commercial.messages.send", mode: "write" },
  payload: { message: "hello" },
};

test("credential and reconnect blockers become human-resolution waits without requesting secrets", () => {
  const state = createBusinessPartnerHumanGateRecoveryState({
    classification: "CONFIGURATION_OR_EXTERNAL",
    reason: "WHATSAPP_CREDENTIAL_UNAVAILABLE",
    configurationRecovery: { status: "HUMAN_CREDENTIAL_REQUIRED" },
    recovery,
  });
  assert.equal(state.gate_kind, "CREDENTIAL_OR_RECONNECT");
  assert.equal(state.status, "AWAITING_HUMAN_RESOLUTION");
  assert.equal(state.secrets_requested, false);
  assert.match(state.human_instruction, /Do not paste passwords, tokens, API keys, or secrets/i);
});
test("wallet and access blockers stay exact-action human gates", () => {
  const wallet = createBusinessPartnerHumanGateRecoveryState({
    classification: "HUMAN_GATE",
    reason: "INSUFFICIENT_WALLET_BALANCE",
    recovery,
  });
  assert.equal(wallet.gate_kind, "WALLET_OR_BILLING");
  assert.equal(wallet.authorization_effect, "NONE");

  const access = createBusinessPartnerHumanGateRecoveryState({
    classification: "HUMAN_GATE",
    reason: "PERMISSION_REQUIRED",
    recovery,
  });
  assert.equal(access.gate_kind, "PERMISSION_OR_ACCESS");
  assert.equal(access.capability_key, recovery.capability.key);
});

test("approval and confirmation continue using their existing dedicated governance paths", () => {
  assert.equal(createBusinessPartnerHumanGateRecoveryState({ classification: "HUMAN_GATE", reason: "APPROVAL_REQUIRED", recovery }), null);
  assert.equal(createBusinessPartnerHumanGateRecoveryState({ classification: "HUMAN_GATE", reason: "CONFIRMATION_REQUIRED", recovery }), null);
});

test("human completion language is evidence only and cannot itself authorize mutation", () => {
  assert.equal(humanGateResolutionReply("done"), true);
  assert.equal(humanGateResolutionReply("here is my token abc"), false);
  const state = createBusinessPartnerHumanGateRecoveryState({ classification: "HUMAN_GATE", reason: "PERMISSION_REQUIRED", recovery });
  const next = authorizeBusinessPartnerHumanGateReinspection(state);
  assert.equal(next.resume_authorized, true);
  assert.equal(next.authorization_effect, "SAME_ACTION_ONLY");
  assert.equal(next.human_resolution_claim_is_evidence_only, true);
  assert.equal(next.prior_confirmation_reused, false);
  assert.equal(next.prior_approval_reused, false);
});
test("synthetic continuation performs fresh server-governed reinspection instead of trusting the human claim", () => {
  assert.match(synthetic, /human_resolution_claim_is_evidence_only:\s*true/);
  assert.match(synthetic, /fresh_server_governance_reinspection:\s*true/);
  assert.match(synthetic, /message:\s*"continue"/);
  assert.match(synthetic, /source:\s*"event"/);
  assert.match(core, /verifiedHumanGateReinspection/);
  assert.match(core, /executionBlockedReason\(capability, \{ source, confirmed: false \}\)|confirmed: explicitlyAuthorized/);
  assert.match(core, /prior_confirmation_reused|confirmation/);
});

test("human gate reinspection cannot bypass the exact recovery allow-list", () => {
  assert.match(core, /AVANTIQO_BUSINESS_PARTNER_HUMAN_GATE_RECOVERY_V1/);
  assert.match(core, /READY_FOR_GOVERNED_REINSPECTION/);
  assert.match(core, /pre_mutation_gate_required === true/);
  assert.match(core, /mutation_completion_proven === false/);
  assert.match(core, /SAME_ACTION_ONLY/);
});
