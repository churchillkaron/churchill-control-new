import {
  WalletRepository,
} from "../repositories/WalletRepository";

import {
  createWalletTransaction,
  WALLET_TRANSACTION_TYPES,
} from "../documents/WalletTransaction";

import {
  createOrganizationWallet,
} from "../documents/OrganizationWallet";

function cleanCurrency(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    return null;
  }
  return normalized.toUpperCase();
}

async function getOrCreate({ organization_id, currency = null }) {
  let wallet = await WalletRepository.getByOrganization(organization_id);
  const resolvedCurrency = cleanCurrency(currency || wallet?.currency);

  if (!wallet) {
    if (!resolvedCurrency) {
      throw new Error("WALLET_CURRENCY_REQUIRED");
    }

    wallet = await WalletRepository.create(
      createOrganizationWallet({ organization_id, currency: resolvedCurrency }),
    );
  }

  if (resolvedCurrency && cleanCurrency(wallet.currency) !== resolvedCurrency) {
    wallet = await WalletRepository.update(wallet.id, {
      currency: resolvedCurrency,
    });
  }

  return wallet;
}

async function balance({ organization_id, currency = null }) {
  const wallet = await getOrCreate({ organization_id, currency });
  return wallet.available_balance || 0;
}

async function existingSettlement({ organization_id, type, usage_id, reference }) {
  return WalletRepository.findTransaction({
    organization_id,
    type,
    usage_id: usage_id || null,
    reference: reference || null,
  });
}

async function reserve({
  organization_id,
  amount,
  provider = null,
  reference = null,
  currency = null,
}) {
  const existing = await existingSettlement({
    organization_id,
    type: WALLET_TRANSACTION_TYPES.RESERVE,
    reference,
  });
  if (existing) return existing;

  const wallet = await getOrCreate({ organization_id, currency });
  const value = Number(amount || 0);

  if (Number(wallet.available_balance || 0) < value) {
    throw new Error("INSUFFICIENT_WALLET_BALANCE");
  }

  await WalletRepository.update(wallet.id, {
    available_balance: Number(wallet.available_balance || 0) - value,
    reserved_balance: Number(wallet.reserved_balance || 0) + value,
  });

  return WalletRepository.addTransaction(
    createWalletTransaction({
      organization_id,
      wallet_id: wallet.id,
      type: WALLET_TRANSACTION_TYPES.RESERVE,
      amount: value,
      currency: wallet.currency,
      provider,
      reference,
    }),
  );
}

async function charge({
  organization_id,
  amount,
  provider = null,
  usage_id = null,
  invoice_id = null,
  reference = null,
  currency = null,
}) {
  const existing = await existingSettlement({
    organization_id,
    type: WALLET_TRANSACTION_TYPES.CHARGE,
    usage_id,
    reference,
  });
  if (existing) return existing;

  const wallet = await getOrCreate({ organization_id, currency });
  const value = Number(amount || 0);

  await WalletRepository.update(wallet.id, {
    reserved_balance: Math.max(
      0,
      Number(wallet.reserved_balance || 0) - value,
    ),
  });

  return WalletRepository.addTransaction(
    createWalletTransaction({
      organization_id,
      wallet_id: wallet.id,
      type: WALLET_TRANSACTION_TYPES.CHARGE,
      amount: value,
      currency: wallet.currency,
      provider,
      usage_id,
      invoice_id,
      reference,
    }),
  );
}

async function release({
  organization_id,
  amount,
  provider = null,
  reference = null,
  currency = null,
}) {
  const existing = await existingSettlement({
    organization_id,
    type: WALLET_TRANSACTION_TYPES.RELEASE,
    reference,
  });
  if (existing) return existing;

  const wallet = await getOrCreate({ organization_id, currency });
  const value = Number(amount || 0);

  await WalletRepository.update(wallet.id, {
    available_balance: Number(wallet.available_balance || 0) + value,
    reserved_balance: Math.max(
      0,
      Number(wallet.reserved_balance || 0) - value,
    ),
  });

  return WalletRepository.addTransaction(
    createWalletTransaction({
      organization_id,
      wallet_id: wallet.id,
      type: WALLET_TRANSACTION_TYPES.RELEASE,
      amount: value,
      currency: wallet.currency,
      provider,
      reference,
    }),
  );
}

async function topup({
  organization_id,
  amount,
  currency,
  metadata = {},
}) {
  const wallet = await getOrCreate({ organization_id, currency });
  const value = Number(amount || 0);

  await WalletRepository.update(wallet.id, {
    available_balance: Number(wallet.available_balance || 0) + value,
  });

  return WalletRepository.addTransaction(
    createWalletTransaction({
      organization_id,
      wallet_id: wallet.id,
      type: WALLET_TRANSACTION_TYPES.TOPUP,
      amount: value,
      currency: wallet.currency,
      metadata,
    }),
  );
}

export const WalletRuntime = {
  getOrCreate,
  balance,
  reserve,
  charge,
  release,
  topup,
};
