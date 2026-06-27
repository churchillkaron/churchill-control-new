export const defaultChartOfAccounts = [
  { code: "1000", name: "Cash", category: "Assets", normal_balance: "Debit" },
  { code: "1100", name: "Bank Account", category: "Assets", normal_balance: "Debit" },
  { code: "1200", name: "Accounts Receivable", category: "Assets", normal_balance: "Debit" },
  { code: "1210", name: "Food Inventory", category: "Assets", normal_balance: "Debit" },
  { code: "1350", name: "Inventory", category: "Assets", normal_balance: "Debit" },

  { code: "2000", name: "Accounts Payable", category: "Liabilities", normal_balance: "Credit" },
  { code: "2100", name: "Payroll Payable", category: "Liabilities", normal_balance: "Credit" },
  { code: "2250", name: "Goods Received Not Invoiced", category: "Liabilities", normal_balance: "Credit" },
  { code: "2410", name: "VAT Payable", category: "Liabilities", normal_balance: "Credit" },

  { code: "3000", name: "Owner Equity", category: "Equity", normal_balance: "Credit" },
  { code: "3100", name: "Retained Earnings", category: "Equity", normal_balance: "Credit" },
  { code: "3900", name: "Income Summary", category: "Temporary", normal_balance: "Credit" },

  { code: "4000", name: "Food Revenue", category: "Revenue", normal_balance: "Credit" },
  { code: "4010", name: "Beverage Revenue", category: "Revenue", normal_balance: "Credit" },
  { code: "4020", name: "Service Revenue", category: "Revenue", normal_balance: "Credit" },

  { code: "5000", name: "Food COGS", category: "COGS", normal_balance: "Debit" },
  { code: "5010", name: "Beverage COGS", category: "COGS", normal_balance: "Debit" },

  { code: "6000", name: "Rent Expense", category: "Operating Expense", normal_balance: "Debit" },
  { code: "6010", name: "Salary Expense", category: "Operating Expense", normal_balance: "Debit" },
  { code: "6020", name: "Utilities Expense", category: "Operating Expense", normal_balance: "Debit" },
  { code: "6030", name: "Marketing Expense", category: "Operating Expense", normal_balance: "Debit" },

  { code: "7000", name: "Interest Expense", category: "Financial Expense", normal_balance: "Debit" }
];
