import runBankReconciliation from "../workflows/runBankReconciliation";
import importBankStatement from "@/lib/finance/integrations/importBankStatement";
import { reconcileGL } from "../capabilities/GLReconciliationEngine";
import { reconcileBankStatements } from "../capabilities/BankReconciliationEngine";
import { validateJournalEntry } from "../capabilities/FinanceReconciliationEngine";
import { listReconciliations } from "../repositories/ReconciliationRepository";

export async function importBankStatementCommand(input) {
  return await importBankStatement(input);
}

export async function runBankReconciliationCommand(input) {
  const data = await runBankReconciliation(input);
  return { success: true, data };
}

export async function listReconciliationCommand(input) {
  return {
    success: true,
    data: await listReconciliations(input),
  };
}

export async function reconcileGLCommand(input) {
  return {
    success: true,
    data: reconcileGL(input),
  };
}

export async function reconcileBankStatementsCommand(input) {
  return {
    success: true,
    data: reconcileBankStatements(input),
  };
}

export async function validateJournalEntryCommand(input) {
  return {
    success: true,
    data: validateJournalEntry(input),
  };
}
