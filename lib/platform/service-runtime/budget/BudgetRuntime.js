export class BudgetRuntime {
  constructor(budgets = {}) {
    this.budgets = budgets;
  }

  get(name) {
    return this.budgets[name] ?? null;
  }

  authorize(name, amount) {
    const budget = this.get(name);

    if (!budget) return true;

    return budget.remaining >= amount;
  }

  consume(name, amount) {
    const budget = this.get(name);

    if (!budget) return;

    if (budget.remaining < amount) {
      throw new Error(`Budget exceeded: ${name}`);
    }

    budget.remaining -= amount;
  }
}
