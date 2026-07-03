import { upsertBankAccount } from "../repositories/bankAccountRepository";

export default async function upsertBankAccountCapability(input) {
  const organization_id =
    input.organization_id ||
    input.organizationId;

  return {
    success: true,
    bankAccount: await upsertBankAccount({
      organization_id,
      values: input.values || input,
    }),
  };
}
