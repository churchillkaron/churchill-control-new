import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";
import isPayrollImmutable from "@/lib/payroll/consolidation/isPayrollImmutable";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
  "MANAGER",
]);

const REVIEWABLE_STATUSES = new Set([
  PAYROLL_STATUS.GENERATED,
  PAYROLL_STATUS.RECALCULATED,
  PAYROLL_STATUS.REJECTED,
]);

export default async function rejectPayrollRecord({
  payrollRecordId,
  organizationId,
  rejectedBy,
  actorName = "MANAGER",
  role = "MANAGER",
  reason = "",
}) {
  if (!ALLOWED_ROLES.has(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll rejection");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!rejectedBy) throw new Error("rejectedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (isPayrollImmutable(record.status)) {
    throw new Error("Archived payroll is immutable");
  }

  if (!canTransition(record.status, PAYROLL_STATUS.REJECTED)) {
    throw new Error(`Invalid payroll transition from ${record.status} to REJECTED`);
  }

  if (!record.entity_id || !record.payroll_month) {
    throw new Error("Payroll entity and month are required for rejection");
  }

  const { data: monthRecords, error: monthError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,status,staff_name")
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month);

  if (monthError) throw monthError;

  const advancedRecord = (monthRecords || []).find(
    (item) => !REVIEWABLE_STATUSES.has(item.status)
  );

  if (advancedRecord) {
    throw new Error(
      "Payroll month has already entered approval or locking and cannot be partially rejected"
    );
  }

  const normalizedReason = String(reason || "").trim();

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      status: PAYROLL_STATUS.REJECTED,
      notes: normalizedReason || record.notes || null,
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .eq("status", record.status)
    .select("*")
    .single();

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_RECORD_REJECTED",
    performedBy: actorName,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes: normalizedReason || `Payroll rejected for ${record.staff_name}`,
  });

  return {
    success: true,
    record: updated,
  };
}
