import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "ACCOUNTING_ADMIN",
]);

const CLOSABLE_STATUSES = new Set([
  PAYROLL_STATUS.FINALIZED,
  PAYROLL_STATUS.ACCOUNTING_CLOSED,
]);

export default async function closePayrollAccountingPeriod({
  payrollRecordId,
  organizationId,
  closedBy,
  role = "ACCOUNTING_ADMIN",
}) {
  if (!ALLOWED_ROLES.has(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized accounting close");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!closedBy) throw new Error("closedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!record.entity_id) {
    throw new Error("Payroll legal entity is required before accounting close");
  }

  if (!record.payroll_month) {
    throw new Error("Payroll month is required before accounting close");
  }

  if (
    record.status !== PAYROLL_STATUS.ACCOUNTING_CLOSED &&
    !canTransition(record.status, PAYROLL_STATUS.ACCOUNTING_CLOSED)
  ) {
    throw new Error(
      `Invalid payroll transition from ${record.status} to ACCOUNTING_CLOSED`
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
    (item) => !CLOSABLE_STATUSES.has(item.status)
  );

  if (invalidStatus) {
    throw new Error(
      `Payroll month must be fully FINALIZED before accounting close: ${invalidStatus.staff_name || "Employee"} is ${invalidStatus.status}`
    );
  }

  const inconsistentClosedRecord = monthRecords.find(
    (item) =>
      item.status === PAYROLL_STATUS.ACCOUNTING_CLOSED &&
      (!item.accounting_period_closed ||
        !item.accounting_period_closed_at ||
        !item.accounting_period_closed_by)
  );

  if (inconsistentClosedRecord) {
    throw new Error(
      "Payroll month contains an inconsistent accounting-close record; review before retrying"
    );
  }

  const recordsToClose = monthRecords.filter(
    (item) => item.status === PAYROLL_STATUS.FINALIZED
  );

  if (recordsToClose.length === 0) {
    return {
      success: true,
      payrollMonth: record.payroll_month,
      entityId: record.entity_id,
      closedCount: 0,
      alreadyClosed: true,
      records: monthRecords,
    };
  }

  const closedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      accounting_period_closed: true,
      accounting_period_closed_at: closedAt,
      accounting_period_closed_by: String(closedBy),
      status: PAYROLL_STATUS.ACCOUNTING_CLOSED,
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month)
    .eq("status", PAYROLL_STATUS.FINALIZED)
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
      item.status !== PAYROLL_STATUS.ACCOUNTING_CLOSED ||
      !item.accounting_period_closed ||
      !item.accounting_period_closed_at ||
      !item.accounting_period_closed_by
  );

  if (incomplete) {
    throw new Error(
      "Payroll month changed during accounting close; refresh and review before retrying"
    );
  }

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_MONTH_ACCOUNTING_CLOSED",
    performedBy: String(closedBy),
    notes: `Closed accounting for ${(updated || []).length} payroll records in ${record.payroll_month}`,
  });

  return {
    success: true,
    payrollMonth: record.payroll_month,
    entityId: record.entity_id,
    closedCount: (updated || []).length,
    alreadyClosed: false,
    records: finalRecords || [],
  };
}
