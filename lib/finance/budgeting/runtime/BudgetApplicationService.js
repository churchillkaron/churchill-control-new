import { createBudget } from "../repositories/BudgetRepository";
import { calculateBudgetVariance } from "../capabilities/calculateBudgetVariance";

export async function createBudgetDocument(input) {
  return await createBudget(input);
}

export async function listBudgetsCommand() {
  return { success: true };
}

export async function calculateBudgetVarianceCommand(input) {
  return calculateBudgetVariance(input);
}
