export const FormRegistry = {

  "cost-center": {
    fields: [
      {
        name: "currency_code",
        label: "Currency",
        defaultValue: "THB"
      },
      {
        name: "name",
        label: "Cost Center",
        required: true
      },
      {
        name: "code",
        label: "Code",
        required: true
      },
      {
        name: "department",
        label: "Department",
        type: "lookup",
        lookup: "departments"
      }
    ]
  },




  "customer": {
    fields: [
      {
        name: "customer_name",
        label: "Customer Name",
        required: true
      },
      {
        name: "customer_phone",
        label: "Phone"
      },
      {
        name: "customer_email",
        label: "Email"
      },
      {
        name: "customer_type",
        label: "Customer Type"
      },
      {
        name: "company_name",
        label: "Company Name"
      },
      {
        name: "tax_number",
        label: "Tax Number"
      },
      {
        name: "billing_address",
        label: "Billing Address"
      },
      {
        name: "shipping_address",
        label: "Shipping Address"
      },
      {
        name: "city",
        label: "City"
      },
      {
        name: "state",
        label: "State"
      },
      {
        name: "postal_code",
        label: "Postal Code"
      },
      {
        name: "country",
        label: "Country"
      },
      {
        name: "preferred_currency",
        label: "Preferred Currency",
        type: "lookup",
        lookup: "currencies"
      },
      {
        name: "credit_limit",
        label: "Credit Limit",
        type: "number"
      },
      {
        name: "payment_terms",
        label: "Payment Terms",
        type: "lookup",
        lookup: "payment_terms"
      },
      {
        name: "birthday",
        label: "Birthday",
        type: "date"
      },
      {
        name: "notes",
        label: "Notes"
      }
    ]
  },


  "vendor-master": {
    fields: [
      {
        name: "vendor_code",
        label: "Vendor Code"
      },
      {
        name: "legal_name",
        label: "Legal Name",
        required: true
      },
      {
        name: "display_name",
        label: "Display Name"
      },
      {
        name: "tax_id",
        label: "Tax ID"
      },
      {
        name: "email",
        label: "Email"
      },
      {
        name: "phone",
        label: "Phone"
      },
      {
        name: "address",
        label: "Address"
      },
      {
        name: "payment_terms",
        label: "Payment Terms",
        type: "lookup",
        lookup: "payment_terms"
      },
      {
        name: "default_expense_account",
        label: "Default Expense Account",
        type: "lookup",
        lookup: "chart_of_accounts"
      },
      {
        name: "default_ap_account",
        label: "Default AP Account",
        type: "lookup",
        lookup: "chart_of_accounts"
      },
      {
        name: "risk_level",
        label: "Risk Level"
      },
      {
        name: "notes",
        label: "Notes"
      },
      {
        name: "is_active",
        label: "Active"
      },
      {
        name: "is_blocked",
        label: "Blocked"
      }
    ]
  },


  "supplier-price": {

    fields: [

      {
        name: "supplier_party_id",
        label: "Supplier",
        required: true
      },

      {
        name: "item_id",
        label: "Item",
        required: true
      },

      {
        name: "price",
        label: "Price",
        type: "number",
        required: true
      },

      {
        name: "minimum_order_quantity",
        label: "Minimum Order Quantity",
        type: "number"
      }

    ]

  },



  "customer-invoice": {

    fields: [

      {
        name: "customer",
        label: "Customer",
        type: "customer",
        required: true
      },

      {
        name: "invoice_date",
        label: "Invoice Date",
        type: "date",
        required: true
      },

      {
        name: "due_date",
        label: "Due Date",
        type: "date",
        required: true
      },

      {
        name: "lines",
        label: "Invoice Lines",
        type: "table",
        columns: [

          {
            name: "description",
            label: "Description"
          },

          {
            name: "quantity",
            label: "Quantity"
          },

          {
            name: "unit_price",
            label: "Unit Price"
          }

        ]
      }

    ]

  },

  "customer-payment": {
    fields: [
      { name: "customer", label: "Customer", type: "customer", required: true },
      { name: "customer_invoice_id", label: "Invoice", required: true },
      { name: "amount", label: "Payment Amount", type: "number", required: true },
      { name: "payment_date", label: "Payment Date", type: "date", required: true },
      { name: "payment_method", label: "Payment Method", required: true },
      { name: "reference_number", label: "Reference Number" },
      { name: "notes", label: "Notes" },
    ],
  },

  "vendor-payment": {
    fields: [
      { name: "vendor", label: "Vendor", type: "vendor", required: true },
      { name: "accounts_payable_id", label: "Accounts Payable Entry", required: true },
      { name: "payment_method", label: "Payment Method", required: true },
      { name: "paid_by", label: "Paid By" },
    ],
  },

  "journal-reversal": {
    fields: [
      { name: "journal_id", label: "Journal", required: true },
      { name: "reversal_date", label: "Reversal Date", type: "date", required: true },
      { name: "reason", label: "Reason", required: true },
    ],
  },

  "journal-entry": {
    fields: [
      { name: "posting_date", label: "Posting Date", type: "date", required: true },
      { name: "document_date", label: "Document Date", type: "date" },
      { name: "journal_type", label: "Journal Type", required: true },
      { name: "reference", label: "Reference" },
      { name: "description", label: "Description", required: true },
      { name: "currency_code", label: "Currency", required: true },
      { name: "exchange_rate", label: "Exchange Rate", type: "number" },
      {
        name: "lines",
        label: "Debit and Credit Lines",
        type: "table",
        columns: [
          { name: "account_id", label: "Account ID" },
          { name: "description", label: "Description" },
          { name: "debit", label: "Debit" },
          { name: "credit", label: "Credit" },
        ],
      },
    ],
  },

  "intercompany-reconciliation": {
    fields: [
      { name: "transaction_id", label: "Intercompany Transaction", required: true },
      { name: "source_balance", label: "Source Balance", type: "number", required: true },
      { name: "target_balance", label: "Target Balance", type: "number", required: true },
      { name: "notes", label: "Reconciliation Notes" },
    ],
  },

  "intercompany": {
    fields: [
      { name: "source_entity_id", label: "Source Entity", required: true },
      { name: "target_entity_id", label: "Target Entity", required: true },
      { name: "transaction_date", label: "Transaction Date", type: "date", required: true },
      { name: "amount", label: "Amount", type: "number", required: true },
      { name: "currency_code", label: "Currency", required: true },
      { name: "description", label: "Description", required: true },
      { name: "reference_number", label: "Reference Number" },
    ],
  },

  "intercompany-settlement": {
    fields: [
      { name: "transaction_id", label: "Intercompany Transaction", required: true },
      { name: "settlement_date", label: "Settlement Date", type: "date", required: true },
      { name: "amount", label: "Settlement Amount", type: "number", required: true },
      { name: "bank_account_id", label: "Bank Account" },
      { name: "reference_number", label: "Reference Number" },
    ],
  },

  "consolidation-run": {
    fields: [
      { name: "organization_ids", label: "Organizations (comma separated)", required: true },
      { name: "reporting_period", label: "Reporting Period", required: true },
      { name: "start_date", label: "Start Date", type: "date", required: true },
      { name: "end_date", label: "End Date", type: "date", required: true },
    ],
  },










  "fiscal-period": {
    fields: [
      {
        name: "period_name",
        label: "Period Name",
        required: true
      },
      {
        name: "start_date",
        label: "Start Date",
        type: "date",
        required: true
      },
      {
        name: "end_date",
        label: "End Date",
        type: "date",
        required: true
      },
      {
        name: "status",
        label: "Status"
      }
    ]
  },


  "fixed-asset": {
    fields: [
      {
        name: "name",
        label: "Asset Name",
        required: true
      },
      {
        name: "asset_number",
        label: "Asset Number"
      },
      {
        name: "category",
        label: "Category"
      },
      {
        name: "purchase_date",
        label: "Purchase Date",
        type: "date"
      },
      {
        name: "purchase_value",
        label: "Purchase Value",
        type: "number"
      },
      {
        name: "useful_life",
        label: "Useful Life",
        type: "number"
      }
    ]
  },




  "budget": {
    fields: [
      {
        name: "category",
        label: "Category",
        required: true
      },
      {
        name: "amount",
        label: "Amount",
        type: "number",
        required: true
      },
      {
        name: "month",
        label: "Month",
        required: true
      },
      {
        name: "year",
        label: "Year",
        type: "number",
        required: true
      }
    ]
  },



  "chart-of-account": {
    fields: [

      {
        name: "account_code",
        label: "Account Code",
        required: true,
        width: "1/2"
      },

      {
        name: "account_name",
        label: "Account Name",
        required: true,
        width: "1/2"
      },

      {
        name: "description",
        label: "Description",
        type: "textarea",
        rows: 3,
        width: "full"
      },

      {
        name: "account_category",
        label: "Category",
        type: "select",
        required: true,
        options: [
          "Assets",
          "Liabilities",
          "Equity",
          "Revenue",
          "Cost of Sales",
          "Expenses",
          "Other Income",
          "Other Expense"
        ],
        width: "1/2"
      },

      {
        name: "account_type",
        label: "Account Type",
        type: "select",
        required: true,
        source: "account-types",
        width: "1/2"
      },

      {
        name: "parent_account",
        label: "Parent Account",
        type: "lookup",
        lookup: "chart_of_accounts",
        width: "1/2"
      },

      {
        name: "reporting_group",
        label: "Reporting Group",
        type: "lookup",
        lookup: "reporting_groups",
        width: "1/2"
      },

      {
        name: "normal_balance",
        label: "Normal Balance",
        type: "select",
        required: true,
        options: [
          "Debit",
          "Credit"
        ],
        width: "1/2"
      },

      {
        name: "currency_code",
        label: "Currency",
        type: "currency",
        required: true,
        width: "1/2"
      },

      {
        name: "tax_category",
        label: "Tax Category",
        type: "select",
        options: [
          "Standard VAT",
          "Zero Rated",
          "Exempt",
          "Withholding",
          "None"
        ],
        width: "1/2"
      },

      {
        name: "allow_manual_posting",
        label: "Allow Manual Posting",
        type: "boolean",
        default: true,
        width: "1/2"
      },

      {
        name: "allow_reconciliation",
        label: "Allow Reconciliation",
        type: "boolean",
        default: false,
        width: "1/2"
      },

      {
        name: "default_cost_center",
        label: "Default Cost Center",
        type: "lookup",
        lookup: "cost_centers",
        width: "1/2"
      },

      {
        name: "default_department",
        label: "Default Department",
        type: "lookup",
        lookup: "departments",
        width: "1/2"
      },

      {
        name: "default_project",
        label: "Default Project",
        type: "lookup",
        lookup: "projects",
        width: "1/2"
      },

      {
        name: "active",
        label: "Active",
        type: "boolean",
        default: true,
        width: "1/2"
      },

      {
        name: "control_account",
        label: "Control Account",
        type: "boolean",
        default: false,
        width: "1/2"
      },

      {
        name: "posting_allowed",
        label: "Posting Allowed",
        type: "boolean",
        default: true,
        width: "1/2"
      }

    ]
  },



  "tax-code": {
    fields: [
      {
        name: "code",
        label: "Tax Code",
        required: true
      },
      {
        name: "name",
        label: "Tax Name",
        required: true
      },
      {
        name: "rate",
        label: "Tax Rate",
        type: "number",
        required: true
      },
      {
        name: "regime",
        label: "Tax Regime"
      },
      {
        name: "standard",
        label: "Accounting Standard"
      },
      {
        name: "effective_from",
        label: "Effective From",
        type: "date"
      },
      {
        name: "effective_to",
        label: "Effective To",
        type: "date"
      }
    ]
  },


  "payment-term": {
    fields: [
      {
        name: "code",
        label: "Code",
        required: true
      },
      {
        name: "name",
        label: "Name",
        required: true
      },
      {
        name: "days",
        label: "Days",
        type: "number",
        required: true
      },
      {
        name: "description",
        label: "Description"
      }
    ]
  },


  "currency": {
    fields: [
      {
        name: "code",
        label: "Currency Code",
        required: true
      },
      {
        name: "name",
        label: "Currency Name",
        required: true
      },
      {
        name: "symbol",
        label: "Symbol"
      },
      {
        name: "decimal_places",
        label: "Decimal Places",
        type: "number"
      }
    ]
  },


  "legal-entity": {
    fields: [
      {
        name: "legal_name",
        label: "Entity Name",
        required: true
      },
      {
        name: "code",
        label: "Code",
        required: true
      },
      {
        name: "country",
        label: "Country",
        required: true
      },
      {
        name: "tax_number",
        label: "Tax Number"
      },
      {
        name: "registration_number",
        label: "Registration Number"
      }
    ]
  },


  "bank-account": {
    fields: [
      {
        name: "bank_name",
        label: "Bank Name",
        required: true
      },
      {
        name: "account_name",
        label: "Account Name",
        required: true
      },
      {
        name: "account_number",
        label: "Account Number",
        required: true
      },
      {
        name: "currency_code",
        label: "Currency",
        type: "lookup",
        lookup: "currencies",
        required: true
      },
      {
        name: "branch_name",
        label: "Branch"
      }
    ]
  },


  "vendor-bill": {
    fields: [
      {
        name: "vendor",
        label: "Vendor",
        type: "vendor",
        required: true
      },
      {
        name: "invoice_date",
        label: "Invoice Date",
        type: "date",
        required: true
      },
      {
        name: "due_date",
        label: "Due Date",
        type: "date"
      },
      {
        name: "invoice_number",
        label: "Invoice Number",
        required: true
      },
      {
        name: "lines",
        label: "Invoice Lines",
        type: "table",
        columns: [
          {
            name: "description",
            label: "Description"
          },
          {
            name: "quantity",
            label: "Quantity"
          },
          {
            name: "unit_price",
            label: "Unit Price"
          }
        ]
      }
    ]
  },


  "wallet-topup": {

    fields: [

      {
        name: "amount",
        label: "Amount",
        type: "number",
        required: true
      },

      {
        name: "currency",
        label: "Currency",
        required: true
      },

      {
        name: "payment_method",
        label: "Payment Method",
        type: "select",
        options: [
          "Credit Card",
          "Bank Transfer",
          "Manual Adjustment",
          "Other"
        ],
        required: true
      },

      {
        name: "reference",
        label: "Reference Number"
      },

      {
        name: "notes",
        label: "Notes"
      }

    ]

  },

  "finance-permission": {
    fields: [
      { name: "role_id", label: "Finance Role", required: true },
      { name: "permission_key", label: "Permission", required: true },
      { name: "notes", label: "Notes" },
    ],
  },


};
