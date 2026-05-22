const UAEPayrollPack = {

  country:
    "UAE",

  currency:
    "AED",

  payroll_frequency:
    "MONTHLY",

  social_security_rate:
    0,

  max_social_security:
    0,

  overtime_multiplier:
    1.25,

  pension_rate:
    0,

  tax_brackets: [

    {
      threshold: 0,
      rate: 0,
    },

  ],

  leave_rules: {

    annual_leave_days: 30,

    sick_leave_days: 90,

    maternity_leave_days: 60,

  },

  overtime_rules: {

    max_daily_hours: 12,

    weekend_multiplier: 1.5,

    holiday_multiplier: 1.5,

  },

  severance_rules: {

    enabled: true,

    calculation:
      "BASIC_SALARY",

  },

  compliance: {

    social_security_required:
      false,

    tax_id_required:
      false,

    payslip_required:
      true,

    payroll_lock_required:
      true,

  },

};

export default UAEPayrollPack;
