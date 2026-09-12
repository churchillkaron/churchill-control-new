import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizeOperatorVerificationDeclaration } from "../lib/operator/runtime/OperatorCapabilityVerificationDeclaration.mjs";
import { verifierPayloadFromActionIdentityEvidence } from "../lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs";
import { collectStableBusinessIdentities } from "../lib/operator/runtime/OperatorDeterministicBusinessEffectRuntime.js";

const read = (path) => fs.readFileSync(path, "utf8");
const po = read("lib/inventory/procurement/purchase-orders/PurchaseOrderOperatorCapability.js");
const supplier = read("lib/inventory/procurement/suppliers/SupplierOperatorCapability.js");
const verifiers = read("lib/inventory/runtime/SupplyChainVerificationReadCapabilities.js");

function cap({ key, mode = "write", input = {}, required = [] }) {
  const [domain, capability, action] = key.split(".");
  return { key, domain, capability, action, mode, context_scope: "entity", operator_enabled: true, input_schema: { type: "object", properties: input, required, additionalProperties: false } };
}

test("server declaration normalizes a separate ambiguous-failure recovery locator", () => {
  const write = cap({ key: "supply_chain.purchase_orders.create", input: { supplier_party_id: { type: "string" } } });
  const readCap = cap({ key: "supply_chain.purchase_orders.read", mode: "read", input: { id: { type: "string" }, idempotency_key: { type: "string" } } });
  const declaration = normalizeOperatorVerificationDeclaration({
    capability_key: readCap.key,
    payload_from_result: { id: ["purchase_order.id"] },
    recovery_payload_from_evidence: { idempotency_key: "idempotency_key" },
  }, write, [write, readCap]);
  assert.deepEqual(declaration, {
    capability_key: readCap.key,
    payload_from_result: { id: ["purchase_order.id"] },
    recovery_payload_from_evidence: { idempotency_key: "idempotency_key" },
  });
});

test("recovery locator binds only from the explicitly declared evidence key", () => {
  const declaration = {
    payload_from_result: { id: ["purchase_order.id"] },
    recovery_payload_from_evidence: { idempotency_key: "idempotency_key" },
  };
  assert.deepEqual(verifierPayloadFromActionIdentityEvidence(declaration, ["idempotency_key:po-key"]), { idempotency_key: "po-key" });
  assert.equal(verifierPayloadFromActionIdentityEvidence(declaration, ["id:pretend-business-id"]), null);
});

test("idempotency locator is never promoted to stable business identity proof", () => {
  assert.deepEqual([...collectStableBusinessIdentities({ idempotency_key: "po-key" })], []);
});

test("purchase order and supplier preserve deterministic locator only after mutation call", () => {
  assert.match(po, /attachActionIdentityEvidence\(result\.error, \[`idempotency_key:\$\{idempotencyKey\}`\]\)/);
  assert.match(supplier, /catch \(error\)[\s\S]*attachActionIdentityEvidence\(error, \[`idempotency_key:\$\{idempotencyKey\}`\]\)/);
  assert.match(po, /recovery_payload_from_evidence: \{ idempotency_key: "idempotency_key" \}/);
  assert.match(supplier, /recovery_payload_from_evidence: \{ idempotency_key: "idempotency_key" \}/);
});

test("authoritative reads map neutral locator to domain storage and explicit outcome", () => {
  assert.match(verifiers, /recoveryStorageField: "idempotency_key"/);
  assert.match(verifiers, /recoveryStorageField: "source_idempotency_key"/);
  assert.match(verifiers, /state: data \? "COMPLETED" : "NOT_COMPLETED"/);
  assert.match(verifiers, /SERVER_BOUND_IDEMPOTENCY_LOCATOR_REINSPECTION/);
  assert.match(verifiers, /safe_to_retry: !data/);
});
