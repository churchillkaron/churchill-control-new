import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import verifyPayrollFinanceEvidence from "@/lib/payroll/accounting/verifyPayrollFinanceEvidence";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "ACCOUNTING_ADMIN",
]);

const CERTIFIABLE_STATUSES = new Set([
  PAYROLL_STATUS.ACCOUNTING_CLOSED,
  PAYROLL_STATUS.CERTIFIED,
]);

export default async function certifyPayrollRecord({
  payrollRecordId,
  organizationId,
  certifiedBy,
  role = "OWNER",
}) {
  if (!ALLOWED_ROLES.has(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll certification");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!certifiedBy) throw new Error("certifiedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!record.entity_id) {
    throw new Error("Payroll legal entity is required before certification");
  }

  if (!record.payroll_month) {
    throw new Error("Payroll month is required before certification");
  }

  if (
    record.status !== PAYROLL_STATUS.CERTIFIED &&
    !canTransition(record.status, PAYROLL_STATUS.CERTIFIED)
  ) {
    throw new Error(
      `Invalid payroll transition from ${record.status} to CERTIFIED`
    );
  }

  const { data: monthRecords, error: monthError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month);

  if (monthError) throw monthError;
  if (!monthRecords?.length) throw new Error("Payroll month not found");

  const invalidStatus = monthRecords.find(
    (item) => !CERTIFIABLE_STATUSES.has(item.status)
  );

  if (invalidStatus) {
    throw new Error(
      `Payroll month must be fully ACCOUNTING_CLOSED before certification: ${invalidStatus.staff_name || "Employee"} is ${invalidStatus.status}`
    );
  }

  await verifyPayrollFinanceEvidence({
    organizationId,
    entityId: record.entity_id,
    payrollMonth: record.payroll_month,
    records: monthRecords,
  });

  const missingCloseEvidence = monthRecords.find(
    (item) =>
      !item.accounting_period_closed ||
      !item.accounting_period_closed_at ||
      !item.accounting_period_closed_by
  );

  if (missingCloseEvidence) {
    throw new Error(
      `Accounting close evidence required before certification: ${missingCloseEvidence.staff_name || "Employee"}`
    );
  }

  const inconsistentCertifiedRecord = monthRecords.find(
    (item) =>
      item.status === PAYROLL_STATUS.CERTIFIED &&
      (!item.payroll_certified ||
        !item.payroll_certified_by ||
        !item.payroll_certified_at)
  );

  if (inconsistentCertifiedRecord) {
    throw new Error(
      "Payroll month contains an inconsistent certification record; review before retrying"
    );
  }

  const recordsToCertify = monthRecords.filter(
    (item) => item.status === PAYROLL_STATUS.ACCOUNTING_CLOSED
  );

  if (recordsToCertify.length === 0) {
    return {
      success: true,
      payrollMonth: record.payroll_month,
      entityId: record.entity_id,
      certifiedCount: 0,
      alreadyCertified: true,
      records: monthRecords,
    };
  }

  const certifiedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      payroll_certified: true,
      payroll_certified_by: String(certifiedBy),
      payroll_certified_at: certifiedAt,
      status: PAYROLL_STATUS.CERTIFIED,
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month)
    .eq("status", PAYROLL_STATUS.ACCOUNTING_CLOSED)
    .select("*");

  if (updateError) throw updateError;

  const { data: finalRecords, error: finalError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month);

  if (finalError) throw finalError;

  const incomplete = (finalRecords || []).find(
    (item) =>
      item.status !== PAYROLL_STATUS.CERTIFIED ||
      !item.payroll_certified ||
      !item.payroll_certified_by ||
      !item.payroll_certified_at
  );

  if (incomplete) {
    throw new Error(
      "Payroll month changed during certification; refresh and review before retrying"
    );
  }

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_MONTH_CERTIFIED",
    performedBy: String(certifiedBy),
    notes: `Certified ${(updated || []).length} payroll records for ${record.payroll_month}`,
  });

  return {
    success: true,
    payrollMonth: record.payroll_month,
    entityId: record.entity_id,
    certifiedCount: (updated || []).length,
    alreadyCertified: false,
    records: finalRecords || [],
  };
}
