import {
  WalletRepository,
} from "../repositories/WalletRepository";

import {
  WALLET_TRANSACTION_TYPES,
} from "../documents/WalletTransaction";

function cleanCurrency(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    return null;
  }
  return normalized.toUpperCase();
}

function positiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("WALLET_AMOUNT_MUST_BE_POSITIVE");
  }
  return amount;
}

function idempotencyKey(operation, { usage_id = null, reference = null } = {}) {
  const identity = usage_id || reference;
  if (!identity) throw new Error("WALLET_IDEMPOTENCY_KEY_REQUIRED");
  return `${operation}:${identity}`;
}

function transactionResult(result = {}) {
  return result.transaction || null;
}

async function getOrCreate({ organization_id, currency = null }) {
  const result = await WalletRepository.applyTransaction({
    organization_id,
    operation: "ENSURE",
    amount: 0,
    currency: cleanCurrency(currency),
  });
  return result.wallet;
}

async function balance({ organization_id, currency = null }) {
  const wallet = await getOrCreate({ organization_id, currency });
  return Number(wallet?.available_balance || 0);
}

async function reserve({ organization_id, amount, provider = null, reference = null, currency = null, metadata = {} }) {
  const operation = WALLET_TRANSACTION_TYPES.RESERVE;
  const result = await WalletRepository.applyTransaction({ organization_id, operation, amount: positiveAmount(amount), currency: cleanCurrency(currency), provider, reference, idempotency_key: idempotencyKey(operation, { reference }), metadata });
  return transactionResult(result);
}

async function charge({ organization_id, amount, provider = null, usage_id = null, invoice_id = null, reference = null, currency = null, metadata = {} }) {
  const operation = WALLET_TRANSACTION_TYPES.CHARGE;
  const result = await WalletRepository.applyTransaction({ organization_id, operation, amount: positiveAmount(amount), currency: cleanCurrency(currency), provider, usage_id, invoice_id, reference, idempotency_key: idempotencyKey(operation, { usage_id, reference }), metadata });
  return transactionResult(result);
}

async function release({ organization_id, amount, provider = null, reference = null, currency = null, metadata = {} }) {
  const operation = WALLET_TRANSACTION_TYPES.RELEASE;
  const result = await WalletRepository.applyTransaction({ organization_id, operation, amount: positiveAmount(amount), currency: cleanCurrency(currency), provider, reference, idempotency_key: idempotencyKey(operation, { reference }), metadata });
  return transactionResult(result);
}

async function topup({ organization_id, amount, currency, reference, provider = null, metadata = {} }) {
  const operation = WALLET_TRANSACTION_TYPES.TOPUP;
  const result = await WalletRepository.applyTransaction({ organization_id, operation, amount: positiveAmount(amount), currency: cleanCurrency(currency), provider, reference, idempotency_key: idempotencyKey(operation, { reference }), metadata });
  return transactionResult(result);
}

export const WalletRuntime = { getOrCreate, balance, reserve, charge, release, topup };
