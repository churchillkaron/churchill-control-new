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

    budgeting: {

      CreateBudget: () =>
        import(
          "@/lib/finance/budgeting/CreateBudget/execute"
        ),

    },

  },

};
