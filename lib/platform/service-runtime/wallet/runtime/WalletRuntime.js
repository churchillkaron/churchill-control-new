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

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function positiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("WALLET_AMOUNT_MUST_BE_POSITIVE");
  }
  return amount;
}

function idempotencyKey(
  operation,
  {
    usage_id = null,
    reference = null,
    idempotency_key = null,
  } = {},
) {
  const identity = String(
    idempotency_key || usage_id || reference || "",
  ).trim();

  if (!identity) {
    throw new Error("WALLET_IDEMPOTENCY_KEY_REQUIRED");
  }

  return identity.startsWith(`${operation}:`)
    ? identity
    : `${operation}:${identity}`;
}

function transactionResult(result = {}) {
  return result.transaction || null;
}

function assertActivePrepaidWallet(wallet, { require_positive_balance = false } = {}) {
  if (!wallet?.id) {
    throw new Error("ORGANIZATION_WALLET_UNAVAILABLE");
  }

  if (upper(wallet.status) !== "ACTIVE") {
    throw new Error("ACTIVE_PREPAID_WALLET_REQUIRED");
  }

  if (upper(wallet.billing_policy) !== "PREPAID") {
    throw new Error("PREPAID_WALLET_REQUIRED");
  }

  if (
    require_positive_balance &&
    Number(wallet.available_balance || 0) <= 0
  ) {
    throw new Error("PREPAID_WALLET_BALANCE_REQUIRED");
  }

  return wallet;
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

async function prepaid({
  organization_id,
  currency = null,
  require_positive_balance = true,
}) {
  const wallet = await getOrCreate({
    organization_id,
    currency,
  });

  return assertActivePrepaidWallet(wallet, {
    require_positive_balance,
  });
}

async function balance({ organization_id, currency = null }) {
  const wallet = await getOrCreate({ organization_id, currency });
  return Number(wallet?.available_balance || 0);
}

async function reserve({
  organization_id,
  amount,
  provider = null,
  reference = null,
  currency = null,
  metadata = {},
  idempotency_key = null,
}) {
  const operation = WALLET_TRANSACTION_TYPES.RESERVE;
  const result = await WalletRepository.applyTransaction({
    organization_id,
    operation,
    amount: positiveAmount(amount),
    currency: cleanCurrency(currency),
    provider,
    reference,
    idempotency_key: idempotencyKey(operation, {
      reference,
      idempotency_key,
    }),
    metadata: {
      ...metadata,
      wallet_policy: "PREPAID",
      provider_execution_funding: true,
    },
  });
  return transactionResult(result);
}

async function charge({
  organization_id,
  amount,
  provider = null,
  usage_id = null,
  invoice_id = null,
  reference = null,
  currency = null,
  metadata = {},
  idempotency_key = null,
}) {
  const operation = WALLET_TRANSACTION_TYPES.CHARGE;
  const result = await WalletRepository.applyTransaction({
    organization_id,
    operation,
    amount: positiveAmount(amount),
    currency: cleanCurrency(currency),
    provider,
    usage_id,
    invoice_id,
    reference,
    idempotency_key: idempotencyKey(operation, {
      usage_id,
      reference,
      idempotency_key,
    }),
    metadata: {
      ...metadata,
      wallet_policy: "PREPAID",
    },
  });
  return transactionResult(result);
}

async function release({
  organization_id,
  amount,
  provider = null,
  reference = null,
  currency = null,
  metadata = {},
  idempotency_key = null,
}) {
  const operation = WALLET_TRANSACTION_TYPES.RELEASE;
  const result = await WalletRepository.applyTransaction({
    organization_id,
    operation,
    amount: positiveAmount(amount),
    currency: cleanCurrency(currency),
    provider,
    reference,
    idempotency_key: idempotencyKey(operation, {
      reference,
      idempotency_key,
    }),
    metadata: {
      ...metadata,
      wallet_policy: "PREPAID",
    },
  });
  return transactionResult(result);
}

async function topup({
  organization_id,
  amount,
  currency,
  reference,
  provider = null,
  metadata = {},
  idempotency_key = null,
}) {
  const operation = WALLET_TRANSACTION_TYPES.TOPUP;
  const result = await WalletRepository.applyTransaction({
    organization_id,
    operation,
    amount: positiveAmount(amount),
    currency: cleanCurrency(currency),
    provider,
    reference,
    idempotency_key: idempotencyKey(operation, {
      reference,
      idempotency_key,
    }),
    metadata,
  });
  return transactionResult(result);
}

export const WalletRuntime = {
  getOrCreate,
  prepaid,
  balance,
  reserve,
  charge,
  release,
  topup,
  assertActivePrepaidWallet,
};
