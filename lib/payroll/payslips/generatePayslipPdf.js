import jsPDF from "jspdf";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function money(value, currencyCode) {
  const amount = Number(value || 0);
  return `${currencyCode || ""} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`.trim();
}

export default async function generatePayslipPdf({
  payrollRecordId,
  organizationId,
  staffId,
  partyId = null,
}) {
  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!staffId) throw new Error("staffId required");

  const { data: record, error } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .maybeSingle();

  if (error) throw error;
  if (!record) throw new Error("Payroll record not found for staff member");

  if (partyId && record.party_id && record.party_id !== partyId) {
    throw new Error("Payroll record party mismatch");
  }

  const currencyCode = record.currency_code || record.payroll_currency || "";
  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.text("PAYSLIP", 20, 20);

  doc.setFontSize(12);
  doc.text(`Employee: ${record.staff_name || "-"}`, 20, 40);
  doc.text(`Role: ${record.role || "-"}`, 20, 50);
  doc.text(`Payroll Month: ${record.payroll_month || "-"}`, 20, 60);
  doc.text(`Status: ${record.status || "-"}`, 20, 70);

  doc.setFontSize(16);
  doc.text("Salary Breakdown", 20, 92);

  doc.setFontSize(12);
  doc.text(`Base Salary: ${money(record.base_salary, currencyCode)}`, 20, 108);
  doc.text(`Overtime Hours: ${Number(record.overtime_hours || 0).toFixed(2)}`, 20, 118);
  doc.text(`Overtime Pay: ${money(record.overtime_pay, currencyCode)}`, 20, 128);
  doc.text(`Service Charge: ${money(record.service_charge_bonus, currencyCode)}`, 20, 138);
  doc.text(`Gross Salary: ${money(record.gross_salary, currencyCode)}`, 20, 148);
  doc.text(`Tax: ${money(record.tax_amount, currencyCode)}`, 20, 158);
  doc.text(`Social Security: ${money(record.social_security, currencyCode)}`, 20, 168);
  doc.text(`Other Deductions: ${money(record.deductions, currencyCode)}`, 20, 178);

  doc.setFontSize(18);
  doc.text(`Net Salary: ${money(record.final_salary, currencyCode)}`, 20, 202);

  doc.setFontSize(12);
  doc.text(`Payout Status: ${record.payout_status || "PENDING"}`, 20, 222);
  doc.text(`Payment Reference: ${record.payment_reference || "-"}`, 20, 232);
  doc.text(`Payment Date: ${record.payment_date || "-"}`, 20, 242);

  doc.setFontSize(9);
  doc.text(`Payroll record: ${record.id}`, 20, 265);
  doc.text(`Generated: ${new Date().toISOString()}`, 20, 273);

  return Buffer.from(doc.output("arraybuffer"));
}
