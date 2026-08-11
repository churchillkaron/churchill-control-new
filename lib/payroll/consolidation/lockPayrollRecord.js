import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import postPayrollAccrual from "@/lib/payroll/accounting/postPayrollAccrual";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

const LOCKABLE_STATUSES = new Set([
  PAYROLL_STATUS.APPROVED,
  PAYROLL_STATUS.LOCKED,
]);

export default async function lockPayrollRecord({
  payrollRecordId,
  organizationId,
  lockedBy,
  actorName = "PAYROLL ADMIN",
  role = "PAYROLL_ADMIN",
}) {
  if (!ALLOWED_ROLES.has(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll lock");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!lockedBy) throw new Error("lockedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!record.entity_id) {
    throw new Error("Payroll legal entity is required before lock");
  }

  if (!record.payroll_month) {
    throw new Error("Payroll month is required before lock");
  }

  if (
    record.status !== PAYROLL_STATUS.LOCKED &&
    !canTransition(record.status, PAYROLL_STATUS.LOCKED)
  ) {
    throw new Error(`Invalid payroll transition from ${record.status} to LOCKED`);
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
    (item) => !LOCKABLE_STATUSES.has(item.status)
  );

  if (invalidStatus) {
    throw new Error(
      `Payroll month must be fully approved before lock: ${invalidStatus.staff_name || "Employee"} is ${invalidStatus.status}`
    );
  }

  const invalidAcknowledgement = monthRecords.find(
    (item) => !item.employee_acknowledged
  );

  if (invalidAcknowledgement) {
    throw new Error(
      `Employee acknowledgement required before month lock: ${invalidAcknowledgement.staff_name || "Employee"}`
    );
  }

  const unresolvedDispute = monthRecords.find(
    (item) => item.employee_dispute && !item.dispute_resolved
  );

  if (unresolvedDispute) {
    throw new Error(
      `Resolve employee dispute before month lock: ${unresolvedDispute.staff_name || "Employee"}`
    );
  }

  const missingApproval = monthRecords.find(
    (item) => !item.approved_by || !item.approved_at
  );

  if (missingApproval) {
    throw new Error(
      `Manager approval required before month lock: ${missingApproval.staff_name || "Employee"}`
    );
  }

  const approvedRecords = monthRecords.filter(
    (item) => item.status === PAYROLL_STATUS.APPROVED
  );

  if (approvedRecords.length === 0) {
    return {
      success: true,
      payrollMonth: record.payroll_month,
      entityId: record.entity_id,
      lockedCount: 0,
      alreadyLocked: true,
      accounting: [],
      records: monthRecords,
    };
  }

  const accounting = [];

  for (const payrollRecord of approvedRecords) {
    accounting.push(
      await postPayrollAccrual({
        payrollRecordId: payrollRecord.id,
        organizationId,
      })
    );
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      status: PAYROLL_STATUS.LOCKED,
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month)
    .eq("status", PAYROLL_STATUS.APPROVED)
    .select("*");

  if (updateError) throw updateError;

  const { data: finalRecords, error: finalError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month);

  if (finalError) throw finalError;

  const notLocked = (finalRecords || []).find(
    (item) => item.status !== PAYROLL_STATUS.LOCKED
  );

  if (notLocked) {
    throw new Error(
      "Payroll month changed during lock; refresh and review before retrying"
    );
  }

  if ((updated || []).length > 0) {
    await createPayrollAuditLog({
      organizationId,
      payrollPeriod: record.payroll_month,
      action: "PAYROLL_MONTH_LOCKED",
      performedBy: actorName,
      notes: `Locked and accrued ${(updated || []).length} payroll records for ${record.payroll_month}`,
    });
  }

  return {
    success: true,
    payrollMonth: record.payroll_month,
    entityId: record.entity_id,
    lockedCount: (updated || []).length,
    alreadyLocked: (updated || []).length === 0,
    accounting,
    records: finalRecords || [],
  };
}
