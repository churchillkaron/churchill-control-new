import jsPDF
from "jspdf";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function generatePayslipPdf({

  payrollRecordId,

}) {

  // =========================
  // LOAD PAYROLL RECORD
  // =========================

  const {
    data: record,
    error,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .select("*")

    .eq(
      "id",
      payrollRecordId
    )

    .single();

  if (error) {
    throw error;
  }

  const doc =
    new jsPDF();

  // =========================
  // HEADER
  // =========================

  doc.setFontSize(22);

  doc.text(
    "PAYSLIP",
    20,
    20
  );

  doc.setFontSize(12);

  doc.text(
    `Employee: ${record.staff_name}`,
    20,
    40
  );

  doc.text(
    `Role: ${record.role}`,
    20,
    50
  );

  doc.text(
    `Payroll Month: ${record.payroll_month}`,
    20,
    60
  );

  // =========================
  // SALARY BREAKDOWN
  // =========================

  doc.setFontSize(16);

  doc.text(
    "Salary Breakdown",
    20,
    85
  );

  doc.setFontSize(12);

  doc.text(
    `Base Salary: ${record.base_salary}`,
    20,
    100
  );

  doc.text(
    `Overtime Hours: ${record.overtime_hours}`,
    20,
    110
  );

  doc.text(
    `Overtime Pay: ${record.overtime_pay}`,
    20,
    120
  );

  doc.text(
    `Service Charge Bonus: ${record.service_charge_bonus}`,
    20,
    130
  );

  doc.text(
    `Deductions: ${record.deductions}`,
    20,
    140
  );

  // =========================
  // FINAL SALARY
  // =========================

  doc.setFontSize(18);

  doc.text(
    `Final Salary: ${record.final_salary}`,
    20,
    170
  );

  // =========================
  // PAYOUT
  // =========================

  doc.setFontSize(12);

  doc.text(
    `Payout Status: ${record.payout_status || "PENDING"}`,
    20,
    190
  );

  doc.text(
    `Payment Reference: ${record.payment_reference || "-"}`,
    20,
    200
  );

  // =========================
  // FOOTER
  // =========================

  doc.setFontSize(10);

  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    20,
    270
  );

  const pdfBuffer =
    doc.output(
      "arraybuffer"
    );

  return Buffer.from(
    pdfBuffer
  );

}
