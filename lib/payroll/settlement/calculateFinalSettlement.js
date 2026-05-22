import calculateSeverancePay
from "./calculateSeverancePay";

export default function calculateFinalSettlement({

  payrollCountryPack = {},

  monthlySalary = 0,

  unusedLeavePayout = 0,

  noticeCompensation = 0,

  deductions = 0,

  yearsOfService = 0,

}) {

  const severancePay =
    calculateSeverancePay({

      payrollCountryPack,

      yearsOfService,

      monthlySalary,

    });

  const finalSettlement =
    Number(
      (
        Number(monthlySalary || 0) +
        Number(unusedLeavePayout || 0) +
        Number(noticeCompensation || 0) +
        Number(severancePay || 0) -
        Number(deductions || 0)
      ).toFixed(2)
    );

  return {

    severancePay,

    finalSettlement,

  };

}
