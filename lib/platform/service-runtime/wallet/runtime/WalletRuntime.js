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
  const currency = String(value || "")
    .trim()
    .toUpperCase();

  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function requiredCurrency(value) {
  const currency = cleanCurrency(value);
  if (!currency) {
    const error = new Error("WALLET_CURRENCY_REQUIRED");
    error.code = error.message;
    throw error;
  }
  return currency;
}

function transactionOfType(rows = [], type) {
  return (rows || []).find((row) => row.type === type) || null;
}

async function transitionState({ organization_id, reference }) {
  const rows = reference
    ? await WalletRepository.transactionsByReference({
        organization_id,
        reference,
      })
    : [];

  return {
    rows,
    reserve: transactionOfType(rows, WALLET_TRANSACTION_TYPES.RESERVE),
    charge: transactionOfType(rows, WALLET_TRANSACTION_TYPES.CHARGE),
    release: transactionOfType(rows, WALLET_TRANSACTION_TYPES.RELEASE),
    refund: transactionOfType(rows, WALLET_TRANSACTION_TYPES.REFUND),
  };
}

async function getOrCreate({ organization_id, currency }) {
  if (!organization_id) throw new Error("organization_id required");

  const resolvedCurrency = requiredCurrency(currency);
  let wallet = await WalletRepository.getByOrganization(organization_id);

  if (!wallet) {
    wallet = await WalletRepository.create(
      createOrganizationWallet({
        organization_id,
        currency: resolvedCurrency,
      }),
    );
  }

  const walletCurrency = requiredCurrency(wallet.currency);
  if (walletCurrency !== resolvedCurrency) {
    const error = new Error("WALLET_CURRENCY_MISMATCH");
    error.code = error.message;
    error.details = {
      organization_id,
      wallet_id: wallet.id,
      wallet_currency: walletCurrency,
      requested_currency: resolvedCurrency,
    };
    throw error;
  }

  return wallet;
}

async function balance({ organization_id, currency }) {
  const wallet = await getOrCreate({ organization_id, currency });
  return Number(wallet.available_balance || 0);
}

async function reserve({
  organization_id,
  amount,
  currency,
  provider = null,
  reference = null,
}) {
  if (reference) {
    const state = await transitionState({ organization_id, reference });
    if (state.reserve) return state.reserve;
    if (state.charge || state.release || state.refund) {
      throw new Error("WALLET_REFERENCE_ALREADY_FINALIZED");
    }
  }

  const wallet = await getOrCreate({ organization_id, currency });
  const value = Number(amount || 0);
  if (value < 0) throw new Error("WALLET_AMOUNT_INVALID");
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
      metadata: { transition: "RESERVED" },
    }),
  );
}

async function charge({
  organization_id,
  amount,
  currency,
  provider = null,
  usage_id = null,
  invoice_id = null,
  reference = null,
}) {
  const resolvedReference = reference || usage_id || null;

  if (resolvedReference) {
    const state = await transitionState({
      organization_id,
      reference: resolvedReference,
    });
    if (state.charge) return state.charge;
    if (state.release || state.refund) {
      throw new Error("WALLET_REFERENCE_ALREADY_REVERSED");
    }
    if (!state.reserve) {
      throw new Error("WALLET_CHARGE_REQUIRES_RESERVATION");
    }
  }

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
      reference: resolvedReference,
      metadata: { transition: "CHARGED" },
    }),
  );
}

async function release({
  organization_id,
  amount,
  currency,
  provider = null,
  reference = null,
}) {
  if (reference) {
    const state = await transitionState({ organization_id, reference });
    if (state.release) return state.release;
    if (state.charge || state.refund) {
      return {
        skipped: true,
        reason: "WALLET_REFERENCE_ALREADY_FINALIZED",
        reference,
        transaction: state.charge || state.refund,
      };
    }
    if (!state.reserve) {
      return {
        skipped: true,
        reason: "WALLET_RESERVATION_NOT_FOUND",
        reference,
      };
    }
  }

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
      metadata: { transition: "RELEASED" },
    }),
  );
}

async function refund({
  organization_id,
  amount,
  currency,
  provider = null,
  usage_id = null,
  reference = null,
  metadata = {},
}) {
  const resolvedReference = reference || usage_id || null;
  if (!resolvedReference) {
    throw new Error("WALLET_REFUND_REFERENCE_REQUIRED");
  }

  const state = await transitionState({
    organization_id,
    reference: resolvedReference,
  });
  if (state.refund) return state.refund;
  if (!state.charge) throw new Error("WALLET_REFUND_REQUIRES_CHARGE");

  const wallet = await getOrCreate({ organization_id, currency });
  const value = Number(amount || state.charge.amount || 0);
  if (value <= 0) throw new Error("WALLET_REFUND_AMOUNT_INVALID");
  if (requiredCurrency(state.charge.currency) !== wallet.currency) {
    throw new Error("WALLET_REFUND_CURRENCY_MISMATCH");
  }

  await WalletRepository.update(wallet.id, {
    available_balance: Number(wallet.available_balance || 0) + value,
  });

  return WalletRepository.addTransaction(
    createWalletTransaction({
      organization_id,
      wallet_id: wallet.id,
      type: WALLET_TRANSACTION_TYPES.REFUND,
      amount: value,
      currency: wallet.currency,
      provider: provider || state.charge.provider || null,
      usage_id: usage_id || state.charge.usage_id || null,
      reference: resolvedReference,
      metadata: {
        ...metadata,
        transition: "REFUNDED",
        reversed_transaction_id: state.charge.id,
      },
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
  if (value <= 0) throw new Error("WALLET_TOPUP_AMOUNT_INVALID");

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
  refund,
  topup,
};
