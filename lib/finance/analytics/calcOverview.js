import { NATURAL_ACCOUNTS } from "./accountingConfig";

// 🔥 MAIN FUNCTION
export function calculateOverview({ revenue = 0, expenses = [], payroll = 0 }) {
  const categorized = categorizeExpenses(expenses);

  const totals = calculateTotals(categorized);

  const totalExpenses =
    totals.COGS +
    totals["Operating Expense"] +
    totals["Owner / Non-Operating"];

  const profit = revenue - totalExpenses - payroll;

  const profitPercent = revenue > 0 ? (profit / revenue) * 100 : 0;

  const costPercent =
    revenue > 0 ? (totals.COGS / revenue) * 100 : 0;

  return {
    revenue,
    payroll,

    cogs: totals.COGS,
    operatingExpense: totals["Operating Expense"],
    nonOperating: totals["Owner / Non-Operating"],

    totalExpenses,
    profit,
    profitPercent: round(profitPercent),
    costPercent: round(costPercent),

    breakdown: categorized,
  };
}

// 🔥 STEP 1: CLASSIFY EXPENSES
function categorizeExpenses(expenses) {
  const result = {
    COGS: {},
    "Operating Expense": {},
    "Owner / Non-Operating": {},
  };

  for (const exp of expenses) {
    const match = findAccount(exp.category);

    if (!match) continue;

    const { type, department, account } = match;

    if (!result[type][department]) {
      result[type][department] = {};
    }

    if (!result[type][department][account]) {
      result[type][department][account] = 0;
    }

    result[type][department][account] += exp.amount;
  }

  return result;
}

// 🔥 STEP 2: TOTALS
function calculateTotals(categorized) {
  const totals = {
    COGS: 0,
    "Operating Expense": 0,
    "Owner / Non-Operating": 0,
  };

  for (const type in categorized) {
    for (const dept in categorized[type]) {
      for (const account in categorized[type][dept]) {
        totals[type] += categorized[type][dept][account];
      }
    }
  }

  return totals;
}

// 🔥 STEP 3: MATCH CATEGORY
function findAccount(category) {
  for (const type in NATURAL_ACCOUNTS) {
    const departments = NATURAL_ACCOUNTS[type];

    for (const dept in departments) {
      const accounts = departments[dept];

      if (accounts.includes(category)) {
        return {
          type,
          department: dept,
          account: category,
        };
      }
    }
  }

  return null;
}

// 🔥 UTIL
function round(num) {
  return Math.round(num * 100) / 100;
}