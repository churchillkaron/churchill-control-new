export const FinanceRuntime = {

  domain: "finance",

  name: "Finance Operations",

  version: "1.0.0",

  capabilities: {

    account: {

      listAccounts: () =>
        import(
          "@/lib/finance/chart-of-accounts/capabilities/listAccounts"
        ),

      upsertAccount: () =>
        import(
          "@/lib/finance/chart-of-accounts/capabilities/upsertAccount"
        ),

      deleteAccount: () =>
        import(
          "@/lib/finance/chart-of-accounts/capabilities/deleteAccount"
        ),

    },

    accounts_receivable: {

      CreateCustomerInvoice: () =>
        import(
          "@/lib/finance/accounts-receivable/CreateCustomerInvoice/execute"
        ),

    },

    customer_receipt: {

      post: () =>
        import(
          "@/lib/finance/accounts-receivable/capabilities/postCustomerReceipt"
        ),

    },

    bank_statements: {

      read: () =>
        import(
          "@/lib/finance/bank-statements/capabilities/readBankStatementImport"
        ),

      create: () =>
        import(
          "@/lib/finance/bank-statements/capabilities/importBankStatement"
        ),

    },

    expense_receipts: {

      post: () =>
        import(
          "@/lib/finance/expense-receipts/capabilities/postPaidExpenseReceipt"
        ),

    },

    vendor_bills: {

      create: () =>
        import(
          "@/lib/finance/accounts-payable/capabilities/createVendorBill"
        ),

    },

    budgeting: {

      CreateBudget: () =>
        import(
          "@/lib/finance/budgeting/CreateBudget/execute"
        ),

    },

  },

};
