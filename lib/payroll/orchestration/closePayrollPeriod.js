import createPayrollPaymentBatch
from "@/lib/payroll/payments/createPayrollPaymentBatch";

import reconcilePayrollPayments
from "@/lib/payroll/payments/reconcilePayrollPayments";

import exportThailandPND
from "@/lib/payroll/compliance/exportThailandPND";

import exportThailandSocialSecurity
from "@/lib/payroll/compliance/exportThailandSocialSecurity";

export default async function closePayrollPeriod({

  payrollRecords = [],

  successfulPayments = [],

  country = "Thailand",

}) {

  const paymentBatch =
    createPayrollPaymentBatch({

      payrollRecords,

    });

  const reconciliation =
    reconcilePayrollPayments({

      paymentBatch,

      successfulPayments,

    });

  let complianceExports =
    {};

  if (
    country === "Thailand"
  ) {

    complianceExports = {

      pnd:
        exportThailandPND({

          payrollRecords,

        }),

      socialSecurity:
        exportThailandSocialSecurity({

          payrollRecords,

        }),

    };

  }

  return {

    success: true,

    payrollClosed: true,

    paymentBatch,

    reconciliation,

    complianceExports,

    closedAt:
      new Date().toISOString(),

  };

}
