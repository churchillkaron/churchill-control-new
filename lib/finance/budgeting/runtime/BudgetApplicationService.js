import {
  createBudget,
  listBudgets,
} from "../repositories/BudgetRepository";
import { calculateBudgetVariance } from "../capabilities/calculateBudgetVariance";

export async function createBudgetDocument(input) {
  return await createBudget(input);
}

export async function listBudgetsCommand(input) {
  return await listBudgets(input);
}

export async function calculateBudgetVarianceCommand(input) {
  return calculateBudgetVariance(input);
}
