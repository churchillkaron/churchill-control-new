import createIntercompanyTransaction from "../documents/createIntercompanyTransaction";
import settleIntercompanyTransaction from "../capabilities/settleIntercompanyTransaction";
import { runIntercompanyReconciliation } from "../workflows/runIntercompanyReconciliation";
import { runIntercompanyElimination } from "../workflows/runIntercompanyElimination";

export async function createIntercompanyTransactionCommand(input) {
  return await createIntercompanyTransaction(input);
}

export async function settleIntercompanyTransactionCommand(input) {
  return await settleIntercompanyTransaction(input);
}

export async function runIntercompanyReconciliationCommand(input) {
  return await runIntercompanyReconciliation(input);
}

export async function runIntercompanyEliminationCommand(input) {
  return await runIntercompanyElimination(input);
}
