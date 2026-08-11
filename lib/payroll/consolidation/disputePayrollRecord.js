import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

const PRE_APPROVAL_STATUSES = new Set([
  PAYROLL_STATUS.GENERATED,
  PAYROLL_STATUS.RECALCULATED,
]);

const POST_PAYMENT_OPEN_STATUSES = new Set([
  PAYROLL_STATUS.PAID,
  PAYROLL_STATUS.DISPUTED,
  PAYROLL_STATUS.RESOLVED,
]);

export default async function disputePayrollRecord({
  payrollRecordId,
  organizationId,
  staffId,
  partyId = null,
  staffName,
  disputeReason,
}) {
  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!staffId) throw new Error("staffId required");

  const reason = String(disputeReason || "").trim();
  if (!reason) throw new Error("disputeReason required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found for staff member");

  if (partyId && record.party_id && record.party_id !== partyId) {
    throw new Error("Payroll record party mismatch");
  }

  if (record.employee_dispute && !record.dispute_resolved) {
    throw new Error("An unresolved payroll dispute already exists");
  }

  if (PRE_APPROVAL_STATUSES.has(record.status)) {
    if (record.employee_acknowledged) {
      throw new Error("Acknowledged payroll cannot be disputed before approval");
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("payroll_records")
      .update({
        employee_dispute: reason,
        dispute_resolved: false,
        dispute_resolution_notes: null,
        dispute_resolved_by: null,
        dispute_resolved_at: null,
      })
      .eq("id", payrollRecordId)
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .eq("status", record.status)
      .select("id,status")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      throw new Error("Payroll status changed before dispute was submitted; reload and retry");
    }

    await createPayrollAuditLog({
      organizationId,
      payrollPeriod: record.payroll_month,
      action: "PAYROLL_DISPUTED",
      performedBy: staffName || "STAFF",
      targetStaffId: record.staff_id,
      targetPartyId: record.party_id || partyId,
      notes: reason,
    });

    return {
      success: true,
      phase: "PRE_APPROVAL",
      status: record.status,
    };
  }

  if (record.status === PAYROLL_STATUS.PAID) {
    if (!record.entity_id) {
      throw new Error("Payroll legal entity is required for post-payment dispute");
    }

    if (!record.payroll_month) {
      throw new Error("Payroll month is required for post-payment dispute");
    }

    if (!canTransition(record.status, PAYROLL_STATUS.DISPUTED)) {
      throw new Error(
        `Invalid payroll transition from ${record.status} to DISPUTED`
      );
    }

    const { data: monthRecords, error: monthError } = await supabaseAdmin
      .from("payroll_records")
      .select("id,status,staff_name")
      .eq("organization_id", organizationId)
      .eq("entity_id", record.entity_id)
      .eq("payroll_month", record.payroll_month);

    if (monthError) throw monthError;

    const closedOrIncompleteRecord = (monthRecords || []).find(
      (item) => !POST_PAYMENT_OPEN_STATUSES.has(item.status)
    );

    if (closedOrIncompleteRecord) {
      throw new Error(
        "Post-payment disputes are unavailable after month finalization or before the month is fully paid"
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("payroll_records")
      .update({
        status: PAYROLL_STATUS.DISPUTED,
        employee_dispute: reason,
        dispute_resolved: false,
        dispute_resolution_notes: null,
        dispute_resolved_by: null,
        dispute_resolved_at: null,
      })
      .eq("id", payrollRecordId)
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .eq("status", PAYROLL_STATUS.PAID)
      .select("id,status")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      throw new Error("Payroll status changed before dispute was submitted; reload and retry");
    }

    await createPayrollAuditLog({
      organizationId,
      payrollPeriod: record.payroll_month,
      action: "PAYROLL_POST_PAYMENT_DISPUTED",
      performedBy: staffName || "STAFF",
      targetStaffId: record.staff_id,
      targetPartyId: record.party_id || partyId,
      notes: reason,
    });

    return {
      success: true,
      phase: "POST_PAYMENT",
      status: PAYROLL_STATUS.DISPUTED,
    };
  }

  throw new Error(
    "Payroll disputes are available before approval or after payment until month finalization"
  );
}
