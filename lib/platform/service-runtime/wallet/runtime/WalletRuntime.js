import {
  WalletRepository,
} from "../repositories/WalletRepository";

import {
  createOrganizationWallet,
} from "../documents/OrganizationWallet";

import {
  createWalletTransaction,
  WALLET_TRANSACTION_TYPES,
} from "../documents/WalletTransaction";

export const WalletRuntime = {

  async getOrCreate(
    organizationId
  ) {

    let wallet =
      await WalletRepository.getByOrganization(
        organizationId
      );

    if (wallet)
      return wallet;

    wallet =
      createOrganizationWallet({
        organization_id:
          organizationId,
      });

    return WalletRepository.create(
      wallet
    );

  },

  async topUp({
    organization_id,
    amount,
    currency = "USD",
    reference = null,
    metadata = {},
  }) {

    const wallet =
      await this.getOrCreate(
        organization_id
      );

    const balance =
      Number(
        wallet.available_balance || 0
      ) + Number(amount);

    await WalletRepository.update(
      wallet.id,
      {
        available_balance:
          balance,
      }
    );

    await WalletRepository.addTransaction(
      createWalletTransaction({
        organization_id,
        wallet_id: wallet.id,
        type:
          WALLET_TRANSACTION_TYPES.TOPUP,
        amount,
        currency,
        reference,
        metadata,
      })
    );

    return WalletRepository.getByOrganization(
      organization_id
    );

  },

  async reserve({
    organization_id,
    amount,
    provider,
    reference,
  }) {

    const wallet =
      await this.getOrCreate(
        organization_id
      );

    const available =
      Number(wallet.available_balance);

    if (available < amount) {
      throw new Error(
        "Insufficient wallet balance."
      );
    }

    await WalletRepository.update(
      wallet.id,
      {
        available_balance:
          available - amount,

        reserved_balance:
          Number(wallet.reserved_balance) +
          amount,
      }
    );

    return WalletRepository.addTransaction(
      createWalletTransaction({
        organization_id,
        wallet_id: wallet.id,
        provider,
        type:
          WALLET_TRANSACTION_TYPES.RESERVE,
        amount,
        reference,
      })
    );

  },

  async release({
    organization_id,
    amount,
    provider,
    reference,
  }) {

    const wallet =
      await this.getOrCreate(
        organization_id
      );

    await WalletRepository.update(
      wallet.id,
      {
        available_balance:
          Number(wallet.available_balance) +
          amount,

        reserved_balance:
          Number(wallet.reserved_balance) -
          amount,
      }
    );

    return WalletRepository.addTransaction(
      createWalletTransaction({
        organization_id,
        wallet_id: wallet.id,
        provider,
        type:
          WALLET_TRANSACTION_TYPES.RELEASE,
        amount,
        reference,
      })
    );

  },

  async charge({
    organization_id,
    amount,
    provider,
    usage_id,
    reference,
  }) {

    const wallet =
      await this.getOrCreate(
        organization_id
      );

    await WalletRepository.update(
      wallet.id,
      {
        reserved_balance:
          Number(wallet.reserved_balance) -
          amount,
      }
    );

    return WalletRepository.addTransaction(
      createWalletTransaction({
        organization_id,
        wallet_id: wallet.id,
        provider,
        usage_id,
        type:
          WALLET_TRANSACTION_TYPES.CHARGE,
        amount,
        reference,
      })
    );

  },

  async refund({
    organization_id,
    amount,
    provider,
    reference,
  }) {

    const wallet =
      await this.getOrCreate(
        organization_id
      );

    await WalletRepository.update(
      wallet.id,
      {
        available_balance:
          Number(wallet.available_balance) +
          amount,
      }
    );

    return WalletRepository.addTransaction(
      createWalletTransaction({
        organization_id,
        wallet_id: wallet.id,
        provider,
        type:
          WALLET_TRANSACTION_TYPES.REFUND,
        amount,
        reference,
      })
    );

  },

};
