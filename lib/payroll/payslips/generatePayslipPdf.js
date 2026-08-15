import jsPDF from "jspdf";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PAYSLIP_STATUSES = new Set([
  "PAID",
  "DISPUTED",
  "RESOLVED",
  "FINALIZED",
  "ACCOUNTING_CLOSED",
  "CERTIFIED",
  "ARCHIVED",
]);

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function money(value, currencyCode) {
  const amount = Number(value || 0);
  return `${currencyCode} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dateValue(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
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

  const status = String(record.status || "").trim().toUpperCase();
  if (!PAYSLIP_STATUSES.has(status)) {
    throw new Error("Payslip is available after payroll payment");
  }

  if (!record.entity_id) {
    throw new Error("Payroll legal entity is required for payslip generation");
  }

  const { data: entity, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select("id,legal_name,display_name,currency")
    .eq("id", record.entity_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (entityError) throw entityError;
  if (!entity) throw new Error("Payroll legal entity not found");

  const currencyCode = normalizeCurrency(entity.currency);
  if (!currencyCode) {
    throw new Error("Payroll legal entity currency is not configured");
  }

  const taxAmount = Number(record.tax_amount || 0);
  const socialSecurity = Number(record.social_security || 0);
  const totalDeductions = Number(record.deductions || 0);
  const otherDeductions = Number(
    Math.max(0, totalDeductions - taxAmount - socialSecurity).toFixed(2)
  );

  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.text("PAYSLIP", 20, 20);

  doc.setFontSize(11);
  doc.text(
    `Legal Entity: ${entity.display_name || entity.legal_name || entity.id}`,
    20,
    34
  );
  doc.text(`Employee: ${record.staff_name || "-"}`, 20, 44);
  doc.text(`Role: ${record.role || "-"}`, 20, 54);
  doc.text(`Payroll Month: ${record.payroll_month || "-"}`, 20, 64);
  doc.text(`Status: ${status || "-"}`, 20, 74);
  doc.text(`Currency: ${currencyCode}`, 20, 84);

  doc.setFontSize(16);
  doc.text("Earnings", 20, 102);

  doc.setFontSize(11);
  doc.text(`Base Pay: ${money(record.base_salary, currencyCode)}`, 20, 116);
  doc.text(`Approved Hours: ${Number(record.approved_hours || 0).toFixed(2)}`, 20, 126);
  doc.text(`Overtime Hours: ${Number(record.overtime_hours || 0).toFixed(2)}`, 20, 136);
  doc.text(`Overtime Pay: ${money(record.overtime_pay, currencyCode)}`, 20, 146);
  doc.text(`Leave Payout: ${money(record.leave_payout, currencyCode)}`, 20, 156);
  doc.text(`Service Charge: ${money(record.service_charge_bonus, currencyCode)}`, 20, 166);
  doc.text(`Gross Pay: ${money(record.gross_salary, currencyCode)}`, 20, 176);

  doc.setFontSize(16);
  doc.text("Deductions", 20, 194);

  doc.setFontSize(11);
  doc.text(`Tax: ${money(taxAmount, currencyCode)}`, 20, 208);
  doc.text(`Social Security: ${money(socialSecurity, currencyCode)}`, 20, 218);
  doc.text(`Other Deductions: ${money(otherDeductions, currencyCode)}`, 20, 228);
  doc.text(`Total Deductions: ${money(totalDeductions, currencyCode)}`, 20, 238);

  doc.setFontSize(17);
  doc.text(`Net Pay: ${money(record.final_salary, currencyCode)}`, 20, 254);

  doc.setFontSize(10);
  doc.text(`Payout Status: ${record.payout_status || "PENDING"}`, 20, 266);
  doc.text(`Payment Reference: ${record.payment_reference || "-"}`, 20, 274);
  doc.text(`Payment Date: ${dateValue(record.payout_date)}`, 20, 282);

  doc.setFontSize(8);
  doc.text(`Payroll record: ${record.id}`, 20, 291);

  return Buffer.from(doc.output("arraybuffer"));
}
