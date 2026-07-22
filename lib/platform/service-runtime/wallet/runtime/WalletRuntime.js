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

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized.toUpperCase();
}

function transactionOfType(rows = [], type) {
  return (rows || []).find((row) => row.type === type) || null;
}

async function transitionState({
  organization_id,
  reference,
}) {
  const rows = reference
    ? await WalletRepository.transactionsByReference({
        organization_id,
        reference,
      })
    : [];

  return {
    rows,
    reserve: transactionOfType(
      rows,
      WALLET_TRANSACTION_TYPES.RESERVE,
    ),
    charge: transactionOfType(
      rows,
      WALLET_TRANSACTION_TYPES.CHARGE,
    ),
    release: transactionOfType(
      rows,
      WALLET_TRANSACTION_TYPES.RELEASE,
    ),
  };
}

async function getOrCreate({
  organization_id,
  currency = "USD",
}) {
  const resolvedCurrency = cleanCurrency(currency) || "USD";

  let wallet = await WalletRepository.getByOrganization(
    organization_id,
  );

  if (!wallet) {
    wallet = await WalletRepository.create(
      createOrganizationWallet({
        organization_id,
        currency: resolvedCurrency,
      }),
    );
  }

  if (
    wallet &&
    cleanCurrency(wallet.currency) !== resolvedCurrency
  ) {
    wallet = await WalletRepository.update(
      wallet.id,
      {
        currency: resolvedCurrency,
      },
    );
  }

  return wallet;
}

async function balance({
  organization_id,
  currency = "USD",
}) {
  const wallet = await getOrCreate({
    organization_id,
    currency,
  });

  return wallet.available_balance || 0;
}

async function reserve({
  organization_id,
  amount,
  provider = null,
  reference = null,
}) {
  if (reference) {
    const state = await transitionState({
      organization_id,
      reference,
    });

    if (state.reserve) return state.reserve;
    if (state.charge || state.release) {
      throw new Error(
        "WALLET_REFERENCE_ALREADY_FINALIZED",
      );
    }
  }

  const wallet = await getOrCreate({
    organization_id,
  });
  const value = Number(amount || 0);

  if (Number(wallet.available_balance || 0) < value) {
    throw new Error("INSUFFICIENT_WALLET_BALANCE");
  }

  await WalletRepository.update(
    wallet.id,
    {
      available_balance:
        Number(wallet.available_balance || 0) - value,
      reserved_balance:
        Number(wallet.reserved_balance || 0) + value,
    },
  );

  return WalletRepository.addTransaction(
    createWalletTransaction({
      organization_id,
      wallet_id: wallet.id,
      type: WALLET_TRANSACTION_TYPES.RESERVE,
      amount: value,
      provider,
      reference,
      metadata: {
        transition: "RESERVED",
      },
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
}) {
  const resolvedReference = reference || usage_id || null;

  if (resolvedReference) {
    const state = await transitionState({
      organization_id,
      reference: resolvedReference,
    });

    if (state.charge) return state.charge;
    if (state.release) {
      const error = new Error(
        "WALLET_REFERENCE_ALREADY_RELEASED",
      );
      error.code = "WALLET_REFERENCE_ALREADY_RELEASED";
      throw error;
    }
    if (!state.reserve) {
      const error = new Error(
        "WALLET_CHARGE_REQUIRES_RESERVATION",
      );
      error.code = "WALLET_CHARGE_REQUIRES_RESERVATION";
      throw error;
    }
  }

  const wallet = await getOrCreate({
    organization_id,
  });
  const value = Number(amount || 0);

  await WalletRepository.update(
    wallet.id,
    {
      reserved_balance: Math.max(
        0,
        Number(wallet.reserved_balance || 0) - value,
      ),
    },
  );

  return WalletRepository.addTransaction(
    createWalletTransaction({
      organization_id,
      wallet_id: wallet.id,
      type: WALLET_TRANSACTION_TYPES.CHARGE,
      amount: value,
      provider,
      usage_id,
      invoice_id,
      reference: resolvedReference,
      metadata: {
        transition: "CHARGED",
      },
    }),
  );
}

async function release({
  organization_id,
  amount,
  provider = null,
  reference = null,
}) {
  if (reference) {
    const state = await transitionState({
      organization_id,
      reference,
    });

    if (state.release) return state.release;
    if (state.charge) {
      return {
        skipped: true,
        reason: "WALLET_REFERENCE_ALREADY_CHARGED",
        reference,
        transaction: state.charge,
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

  const wallet = await getOrCreate({
    organization_id,
  });
  const value = Number(amount || 0);

  await WalletRepository.update(
    wallet.id,
    {
      available_balance:
        Number(wallet.available_balance || 0) + value,
      reserved_balance: Math.max(
        0,
        Number(wallet.reserved_balance || 0) - value,
      ),
    },
  );

  return WalletRepository.addTransaction(
    createWalletTransaction({
      organization_id,
      wallet_id: wallet.id,
      type: WALLET_TRANSACTION_TYPES.RELEASE,
      amount: value,
      provider,
      reference,
      metadata: {
        transition: "RELEASED",
      },
    }),
  );
}

async function topup({
  organization_id,
  amount,
  currency = null,
  metadata = {},
}) {
  const wallet = await getOrCreate({
    organization_id,
  });
  const value = Number(amount || 0);

  await WalletRepository.update(
    wallet.id,
    {
      available_balance:
        Number(wallet.available_balance || 0) + value,
    },
  );

  return WalletRepository.addTransaction(
    createWalletTransaction({
      organization_id,
      wallet_id: wallet.id,
      type: WALLET_TRANSACTION_TYPES.TOPUP,
      amount: value,
      currency: currency || undefined,
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
