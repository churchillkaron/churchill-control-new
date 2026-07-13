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
  const normalized =
    String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized.toUpperCase();
}


async function getOrCreate({
  organization_id,
  currency = "USD",
}) {

  const resolvedCurrency =
    cleanCurrency(currency) ||
    "USD";

  let wallet =
    await WalletRepository.getByOrganization(
      organization_id
    );


  if (!wallet) {

    wallet =
      await WalletRepository.create(
        createOrganizationWallet({
          organization_id,
          currency:
            resolvedCurrency,
        })
      );

  }

  if (
    wallet &&
    cleanCurrency(wallet.currency) !== resolvedCurrency
  ) {
    wallet =
      await WalletRepository.update(
        wallet.id,
        {
          currency:
            resolvedCurrency,
        }
      );
  }


  return wallet;

}


async function balance({
  organization_id,
  currency = "USD",
}) {

  const wallet =
    await getOrCreate({
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

  const wallet =
    await getOrCreate({
      organization_id,
    });


  const value =
    Number(amount || 0);


  if (
    Number(wallet.available_balance || 0)
    <
    value
  ) {

    throw new Error(
      "INSUFFICIENT_WALLET_BALANCE"
    );

  }


  await WalletRepository.update(
    wallet.id,
    {

      available_balance:
        Number(wallet.available_balance || 0)
        -
        value,

      reserved_balance:
        Number(wallet.reserved_balance || 0)
        +
        value,

    }
  );


  return WalletRepository.addTransaction(

    createWalletTransaction({

      organization_id,

      wallet_id:
        wallet.id,

      type:
        WALLET_TRANSACTION_TYPES.RESERVE,

      amount:
        value,

      provider,

      reference,

    })

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

  const wallet =
    await getOrCreate({
      organization_id,
    });


  const value =
    Number(amount || 0);


  await WalletRepository.update(
    wallet.id,
    {

      reserved_balance:
        Math.max(
          0,
          Number(wallet.reserved_balance || 0)
          -
          value
        ),

    }
  );


  return WalletRepository.addTransaction(

    createWalletTransaction({

      organization_id,

      wallet_id:
        wallet.id,

      type:
        WALLET_TRANSACTION_TYPES.CHARGE,

      amount:
        value,

      provider,

      usage_id,

      invoice_id,

      reference,

    })

  );

}


async function release({
  organization_id,
  amount,
  provider = null,
  reference = null,
}) {

  const wallet =
    await getOrCreate({
      organization_id,
    });


  const value =
    Number(amount || 0);


  await WalletRepository.update(
    wallet.id,
    {

      available_balance:
        Number(wallet.available_balance || 0)
        +
        value,

      reserved_balance:
        Math.max(
          0,
          Number(wallet.reserved_balance || 0)
          -
          value
        ),

    }
  );


  return WalletRepository.addTransaction(

    createWalletTransaction({

      organization_id,

      wallet_id:
        wallet.id,

      type:
        WALLET_TRANSACTION_TYPES.RELEASE,

      amount:
        value,

      provider,

      reference,

    })

  );

}


async function topup({
  organization_id,
  amount,
  currency = null,
  metadata = {},
}) {

  const wallet =
    await getOrCreate({
      organization_id,
    });


  const value =
    Number(amount || 0);


  await WalletRepository.update(
    wallet.id,
    {

      available_balance:
        Number(wallet.available_balance || 0)
        +
        value,

    }
  );


  return WalletRepository.addTransaction(

    createWalletTransaction({

      organization_id,

      wallet_id:
        wallet.id,

      type:
        WALLET_TRANSACTION_TYPES.TOPUP,

      amount:
        value,

      currency:
        currency || undefined,

      metadata,

    })

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
