import { createJournalEntry }
from "@/lib/finance/accounting/createJournalEntry";

export async function createPayrollLiabilityJournal({

  tenantId,

  payrollRecord,

  createdBy = "system",

}) {

  const grossSalary =
    Number(
      payrollRecord.gross_salary || 0
    );

  const taxAmount =
    Number(
      payrollRecord.tax_amount || 0
    );

  const socialSecurity =
    Number(
      payrollRecord.social_security || 0
    );

  const netSalary =
    Number(
      payrollRecord.final_salary || 0
    );

  return await financeGateway({ type: "PAYROLL_LEDGER", payload: {

    tenantId,

    entryDate:
      new Date().toISOString(),

    description:
      `Payroll liability for ${payrollRecord.staff_name}`,

    sourceType:
      "PAYROLL",

    sourceId:
      payrollRecord.id,

    createdBy,

    lines: [

      {
        account_id:
          "PAYROLL_EXPENSE",

        debit:
          grossSalary,

        credit:
          0,
      },

      {
        account_id:
          "SALARY_PAYABLE",

        debit:
          0,

        credit:
          netSalary,
      },

      {
        account_id:
          "TAX_PAYABLE",

        debit:
          0,

        credit:
          taxAmount,
      },

      {
        account_id:
          "SOCIAL_SECURITY_PAYABLE",

        debit:
          0,

        credit:
          socialSecurity,
      },

    ],

  });

}
