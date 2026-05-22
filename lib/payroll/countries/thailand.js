const ThailandPayrollPack = {

  country:
    "Thailand",

  currency:
    "THB",

  payroll_frequency:
    "MONTHLY",

  social_security_rate:
    5,

  max_social_security:
    750,

  overtime_multiplier:
    1.5,

  pension_rate:
    0,

  tax_brackets: [

    {
      threshold: 0,
      rate: 0,
    },

    {
      threshold: 150000,
      rate: 5,
    },

    {
      threshold: 300000,
      rate: 10,
    },

    {
      threshold: 500000,
      rate: 15,
    },

    {
      threshold: 750000,
      rate: 20,
    },

    {
      threshold: 1000000,
      rate: 25,
    },

  ],

  leave_rules: {

    annual_leave_days: 6,

    sick_leave_days: 30,

    maternity_leave_days: 98,

  },

  overtime_rules: {

    max_daily_hours: 12,

    weekend_multiplier: 2,

    holiday_multiplier: 3,

  },

  severance_rules: {

    enabled: true,

    calculation:
      "YEARS_OF_SERVICE",

  },

  compliance: {

    social_security_required:
      true,

    tax_id_required:
      true,

    payslip_required:
      true,

    payroll_lock_required:
      true,

  },

};

export default ThailandPayrollPack;
