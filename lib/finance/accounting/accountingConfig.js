export const ACCOUNT_TYPES = [
  "Revenue",
  "COGS",
  "Operating Expense",
  "Owner / Non-Operating",
];

export const DEPARTMENTS = [
  "Kitchen",
  "Bar",
  "Breakfast",
  "Entertainment",
  "Operations",
  "Admin",
  "Utilities",
  "Staff Welfare",
  "Marketing",
  "Owner",
];

export const NATURAL_ACCOUNTS = {
  COGS: {
    Kitchen: [
      "Food Main Kitchen",
      "Food Thai Kitchen",
      "Pizza Kitchen",
    ],
    Bar: [
      "Alcohol",
      "Soft Drinks",
    ],
    Breakfast: [
      "Breakfast Food",
    ],
  },

  "Operating Expense": {
    Entertainment: [
      "DJ",
      "Band",
      "Acoustic",
      "Events",
    ],

    "Staff Welfare": [
      "Staff Food",
      "Staff Drinks",
      "Staff Rewards",
      "Staff Tax",
      "SSO",
    ],

    Operations: [
      "Cleaning",
      "Decoration",
      "Maintenance",
      "Restaurant Supplies",
      "Transportation",
      "Kitchen Supplies",
      "Bar Supplies",
      "Bar Equipment",
    ],

    Admin: [
      "Rent",
      "Accounting Fees",
      "Software",
      "Depreciation",
      "Salaries",
      "Overtime",
      "Service Charge",
      "Postage",
    ],

    Utilities: [
      "Electricity",
      "Gas",
    ],

    Marketing: [
      "Ads",
      "Social Media",
      "Promotions",
      "Content Creation",
    ],

    "Other Operating": [
      "Miscellaneous",
      "Police / Irregular",
    ],
  },

  "Owner / Non-Operating": {
    Owner: [
      "Owner Funding",
      "Owner Withdrawal",
    ],
  },
};