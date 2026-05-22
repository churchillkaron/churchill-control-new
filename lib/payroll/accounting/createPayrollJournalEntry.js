import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function createPayrollJournalEntry({

  payrollRecord,

  postingType = "PAYROLL_ACCRUAL",

}) {

  if (!payrollRecord) {

    throw new Error(
      "Payroll record required"
    );

  }

  // =====================================
  // DUPLICATE PROTECTION
  // =====================================

  if (
    postingType ===
    "PAYROLL_ACCRUAL" &&

    payrollRecord
      .accrual_journal_entry_id
  ) {

    throw new Error(
      "Payroll accrual already posted"
    );

  }

  if (
    postingType ===
    "PAYROLL_SETTLEMENT" &&

    payrollRecord
      .settlement_journal_entry_id
  ) {

    throw new Error(
      "Payroll settlement already posted"
    );

  }

  // =====================================
  // ACCOUNTING PERIOD VALIDATION
  // =====================================

  if (
    payrollRecord
      .accounting_period_closed
  ) {

    throw new Error(
      "Accounting period closed"
    );

  }

  const salaryExpense =
    Number(
      payrollRecord.final_salary || 0
    );

  const payrollPayable =
    salaryExpense;

  // =====================================
  // ACCOUNT MAPPING
  // =====================================

  const department =
    payrollRecord.department_cost_center || "GENERAL";

  const salaryExpenseAccount =

    department === "KITCHEN"
      ? "KITCHEN_LABOR_EXPENSE"

    : department === "BAR"
      ? "BAR_LABOR_EXPENSE"

    : department === "MARKETING"
      ? "MARKETING_PAYROLL_EXPENSE"

    : "FOH_LABOR_EXPENSE";

  const accounts = {

    salaryExpense:
      salaryExpenseAccount,

    payrollPayable:
      "PAYROLL_PAYABLE",

    cash:
      "CASH",

  };

  // =====================================
  // JOURNAL ENTRY
  // =====================================

  const journalEntry = {

    tenant_id:
      payrollRecord.tenant_id,

    journal_type:
      postingType,

    reference_type:
      "PAYROLL",

    reference_id:
      payrollRecord.id,

    posting_date:
      new Date()
        .toISOString(),

    description:
      `Payroll posting for ${payrollRecord.staff_name}`,

    total_amount:
      salaryExpense,

  };

  const {
    data: entry,
    error: entryError,
  } = await supabaseAdmin

    .from(
      "journal_entries"
    )

    .insert(
      journalEntry
    )

    .select()

    .single();

  if (entryError) {

    throw entryError;

  }

  // =====================================
  // JOURNAL LINES
  // =====================================

  const lines = [];

  // =====================================
  // ACCRUAL ENTRY
  // =====================================

  if (
    postingType ===
    "PAYROLL_ACCRUAL"
  ) {

    // DR SALARY EXPENSE
    lines.push({

      tenant_id:
        payrollRecord.tenant_id,

      journal_entry_id:
        entry.id,

      account_code:
        accounts.salaryExpense,

      debit:
        salaryExpense,

      credit:
        0,

      description:
        `Salary expense for ${payrollRecord.staff_name}`,

    });

    // CR PAYROLL PAYABLE
    lines.push({

      tenant_id:
        payrollRecord.tenant_id,

      journal_entry_id:
        entry.id,

      account_code:
        accounts.payrollPayable,

      debit:
        0,

      credit:
        payrollPayable,

      description:
        `Payroll payable for ${payrollRecord.staff_name}`,

    });

  }

  // =====================================
  // SETTLEMENT ENTRY
  // =====================================

  if (
    postingType ===
    "PAYROLL_SETTLEMENT"
  ) {

    // DR PAYROLL PAYABLE
    lines.push({

      tenant_id:
        payrollRecord.tenant_id,

      journal_entry_id:
        entry.id,

      account_code:
        accounts.payrollPayable,

      debit:
        payrollPayable,

      credit:
        0,

      description:
        `Payroll settlement for ${payrollRecord.staff_name}`,

    });

    // CR CASH
    lines.push({

      tenant_id:
        payrollRecord.tenant_id,

      journal_entry_id:
        entry.id,

      account_code:
        accounts.cash,

      debit:
        0,

      credit:
        payrollPayable,

      description:
        `Cash payroll payout for ${payrollRecord.staff_name}`,

    });

  }

  const {
    error: linesError,
  } = await supabaseAdmin

    .from(
      "journal_entry_lines"
    )

    .insert(
      lines
    );

  if (linesError) {

    throw linesError;

  }

  // =====================================
  // STORE JOURNAL REFERENCES
  // =====================================

  const updates = {};

  if (
    postingType ===
    "PAYROLL_ACCRUAL"
  ) {

    updates
      .accrual_journal_entry_id =
        entry.id;

  }

  if (
    postingType ===
    "PAYROLL_SETTLEMENT"
  ) {

    updates
      .settlement_journal_entry_id =
        entry.id;

  }

  await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update(
      updates
    )

    .eq(
      "id",
      payrollRecord.id
    );

  return {

    success: true,

    journalEntryId:
      entry.id,

  };

}
