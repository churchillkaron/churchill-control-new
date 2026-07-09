export const FinanceRuntime = {

  domain: "finance",

  name: "Finance Operations",

  version: "1.0.0",

  capabilities: {

    accounts_receivable: {

      CreateCustomerInvoice: () =>
        import(
          "@/lib/finance/accounts-receivable/CreateCustomerInvoice/execute"
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
