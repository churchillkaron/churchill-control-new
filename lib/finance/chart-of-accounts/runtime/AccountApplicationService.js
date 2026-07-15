import {
  listAccounts,
} from "../capabilities/listAccounts";

import {
  upsertAccount,
} from "../capabilities/upsertAccount";

import {
  deleteAccount,
} from "../capabilities/deleteAccount";

export async function listAccountsCommand(input) {
  return listAccounts(input);
}

export async function upsertAccountCommand(input) {
  return upsertAccount(input);
}

export async function deleteAccountCommand(input) {
  return deleteAccount(input);
}
