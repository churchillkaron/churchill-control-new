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
        label: "Department"
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


};
