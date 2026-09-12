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

    customer_invoices: {

      read: async () => { const m = await import("@/lib/finance/runtime/FinanceBusinessRecordVerificationCapabilities"); return m.createCustomerInvoiceReadCapability(); },

    },

    customer_receipt: {

      read: async () => { const m = await import("@/lib/finance/runtime/FinanceMoneyVerificationCapabilities"); return m.createCustomerReceiptReadCapability(); },

      post: () =>
        import(
          "@/lib/finance/accounts-receivable/capabilities/postCustomerReceipt"
        ),

    },

    bank_statements: {

      read: async () => { const m = await import("@/lib/finance/bank-statements/capabilities/readBankStatementImport"); return m.createBankStatementImportReadCapability(); },

      create: () =>
        import(
          "@/lib/finance/bank-statements/capabilities/importBankStatement"
        ),

    },

    expense_receipts: {

      read: async () => { const m = await import("@/lib/finance/runtime/FinanceMoneyVerificationCapabilities"); return m.createExpenseReceiptReadCapability(); },

      post: () =>
        import(
          "@/lib/finance/expense-receipts/capabilities/postPaidExpenseReceipt"
        ),

    },

    vendor_bills: {

      read: async () => { const m = await import("@/lib/finance/runtime/FinanceBusinessRecordVerificationCapabilities"); return m.createVendorBillReadCapability(); },

      create: () =>
        import(
          "@/lib/finance/accounts-payable/capabilities/createVendorBill"
        ),

    },

    vendor_payments: {

      read: async () => { const m = await import("@/lib/finance/runtime/FinanceMoneyVerificationCapabilities"); return m.createVendorPaymentReadCapability(); },

      post: () =>
        import(
          "@/lib/finance/accounts-payable/capabilities/postVendorPayment"
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
