import { randomUUID } from "node:crypto";

import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import processVendorPayment from "@/lib/finance/payments/capabilities/processVendorPayment";

const REQUIRED_PERMISSION = "finance.payables.manage";
const text = (value) => String(value ?? "").trim();
const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const actorId = (context = {}) => text(context.actor?.id || context.actor?.user_id || context.metadata?.actorId);

export const manifest = defineCapability({
  domain: "finance", capability: "vendor_payments", action: "post",
  name: "Post vendor payment",
  description: "Post one governed vendor payment against an accounts-payable balance and verify the exact resulting payment record.",
  permissions: [REQUIRED_PERMISSION], events: ["finance.vendor_payment.posted"],
  tags: ["finance", "accounts_payable", "vendor", "payment"], transactional: true,
  aiEnabled: false, operatorEnabled: true, operatorMode: "approve", operatorAutoExecute: false,
  operatorRequiresConfirmation: true, risk: "high", reversible: true, contextScope: "entity",
  operatorVerification: { capability_key: "finance.vendor_payments.read", payload_from_result: { payment_id: ["payment_id", "payment.id"] }, derivation: "declared_result_bound_vendor_payment_verifier" },
  inputSchema: { type: "object", required: ["accounts_payable_id", "amount", "bank_account_id"], properties: {
    accounts_payable_id: { type: "string" }, amount: { type: "number", exclusiveMinimum: 0 }, bank_account_id: { type: "string" },
    payment_method: { type: "string" }, reference_number: { type: ["string", "null"] }, paid_at: { type: ["string", "null"] },
    currency_code: { type: ["string", "null"] }, exchange_rate: { type: ["number", "null"], exclusiveMinimum: 0 },
  }, additionalProperties: false },
});

export function validate({ context, payload = {} }) {
  if (!text(context?.organizationId)) throw new Error("organization_id required");
  if (!text(context?.entityId)) throw new Error("entity_id required");
  if (!actorId(context)) throw new Error("authenticated actor required");
  if (!text(payload.accounts_payable_id)) throw new Error("accounts_payable_id required");
  if (!text(payload.bank_account_id)) throw new Error("bank_account_id required");
  if (!(amount(payload.amount) > 0)) throw new Error("amount must be greater than zero");
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const paymentId = randomUUID();
  const idempotencyKey = ["operator-vendor-payment-v1", context.organizationId, context.entityId, payload.accounts_payable_id, Number(payload.amount).toFixed(2), payload.bank_account_id, text(payload.reference_number) || "none"].join(":");
  const result = await processVendorPayment({
    organization_id: context.organizationId, entity_id: context.entityId,
    accounts_payable_id: payload.accounts_payable_id, amount: payload.amount, bank_account_id: payload.bank_account_id,
    payment_method: text(payload.payment_method) || "BANK_TRANSFER", reference_number: text(payload.reference_number) || null,
    paid_by: actorId(context), paid_at: text(payload.paid_at) || null, currency_code: text(payload.currency_code) || null,
    exchange_rate: payload.exchange_rate ?? null, idempotency_key: idempotencyKey, payment_id: paymentId, throw_on_error: true,
  });
  if (result?.success !== true) throw new Error(result?.error || "VENDOR_PAYMENT_POST_FAILED");
  return { ...result, payment_id: result?.payment?.id || result?.payment_id || paymentId, authorization_effect: "CONFIRMED_OPERATOR_WRITE" };
}
