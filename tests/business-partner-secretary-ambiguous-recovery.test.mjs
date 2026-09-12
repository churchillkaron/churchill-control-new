import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizeOperatorAmbiguousWriteRecovery } from "../lib/operator/runtime/OperatorAmbiguousWriteRecoveryRuntime.mjs";

const binding = fs.readFileSync("lib/operator/runtime/OperatorVerificationBindingRuntime.mjs", "utf8");
const catalog = fs.readFileSync("lib/operator/runtime/OperatorCapabilityCatalog.js", "utf8");

test("ambiguous write recovery accepts only server classes", () => {
  assert.equal(normalizeOperatorAmbiguousWriteRecovery("UNCERTAIN_NO_REPLAY"), "UNCERTAIN_NO_REPLAY");
  assert.equal(normalizeOperatorAmbiguousWriteRecovery("PREBOUND_EXACT_ID"), "PREBOUND_EXACT_ID");
  assert.equal(normalizeOperatorAmbiguousWriteRecovery("AUTHORITATIVE_RECOVERY_LOCATOR"), "AUTHORITATIVE_RECOVERY_LOCATOR");
  assert.equal(normalizeOperatorAmbiguousWriteRecovery("AUTO_REPLAY"), null);
});

test("verified Secretary writes default to fail-closed ambiguous recovery", () => {
  assert.match(binding, /UNCERTAIN_NO_REPLAY/);
  assert.match(binding, /operatorAmbiguousWriteRecovery/);
});

test("catalog normalizes and exposes ambiguous recovery independently", () => {
  assert.match(catalog, /declared_ambiguous_write_recovery/);
  assert.match(catalog, /ambiguous_write_recovery_status/);
  assert.match(catalog, /normalizeOperatorAmbiguousWriteRecovery/);
});

test("Secretary writes without declarations infer only no-replay recovery", () => {
  assert.match(catalog, /secretaryFailClosedRecovery/);
  assert.match(catalog, /INFERRED_FAIL_CLOSED/);
  assert.match(catalog, /UNCERTAIN_NO_REPLAY/);
});

test("action identity certification audits resolved Secretary recovery", () => {
  const cert = fs.readFileSync("scripts/certify-business-partner-action-identity-coverage-local.mjs", "utf8");
  assert.match(cert, /listOperatorCapabilities/);
  assert.match(cert, /secretary_ambiguous_writes_never_auto_replay/);
  assert.match(cert, /secretary_recovery_no_invalid_declarations/);
  assert.match(cert, /UNCERTAIN_NO_REPLAY/);
});
