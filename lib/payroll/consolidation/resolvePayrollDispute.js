import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

const PRE_APPROVAL_STATUSES = new Set([
  PAYROLL_STATUS.GENERATED,
  PAYROLL_STATUS.RECALCULATED,
]);

export default async function resolvePayrollDispute({
  payrollRecordId,
  organizationId,
  resolvedBy,
  resolutionNotes = "",
  role = "PAYROLL_ADMIN",
}) {
  const normalizedRole = String(role || "").trim().toUpperCase();
  const notes = String(resolutionNotes || "").trim();

  if (!ALLOWED_ROLES.has(normalizedRole)) {
    throw new Error("Unauthorized dispute resolution");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!resolvedBy) throw new Error("resolvedBy required");
  if (!notes) throw new Error("resolutionNotes required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!record.employee_dispute || record.dispute_resolved) {
    throw new Error("No unresolved employee payroll dispute exists");
  }

  const resolvedAt = new Date().toISOString();

  if (PRE_APPROVAL_STATUSES.has(record.status)) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("payroll_records")
      .update({
        dispute_resolved: true,
        dispute_resolution_notes: notes,
        dispute_resolved_by: resolvedBy,
        dispute_resolved_at: resolvedAt,
      })
      .eq("id", payrollRecordId)
      .eq("organization_id", organizationId)
      .eq("status", record.status)
      .select("id,status")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      throw new Error("Payroll status changed before dispute resolution; reload and retry");
    }

    await createPayrollAuditLog({
      organizationId,
      payrollPeriod: record.payroll_month,
      action: "PAYROLL_DISPUTE_RESOLVED",
      performedBy: resolvedBy,
      targetStaffId: record.staff_id,
      targetPartyId: record.party_id || null,
      notes,
    });

    return {
      success: true,
      phase: "PRE_APPROVAL",
      status: record.status,
    };
  }

  if (record.status === PAYROLL_STATUS.DISPUTED) {
    if (!canTransition(record.status, PAYROLL_STATUS.RESOLVED)) {
      throw new Error(
        `Invalid payroll transition from ${record.status} to RESOLVED`
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("payroll_records")
      .update({
        status: PAYROLL_STATUS.RESOLVED,
        dispute_resolved: true,
        dispute_resolution_notes: notes,
        dispute_resolved_by: resolvedBy,
        dispute_resolved_at: resolvedAt,
      })
      .eq("id", payrollRecordId)
      .eq("organization_id", organizationId)
      .eq("status", PAYROLL_STATUS.DISPUTED)
      .select("id,status")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      throw new Error("Payroll status changed before dispute resolution; reload and retry");
    }

    await createPayrollAuditLog({
      organizationId,
      payrollPeriod: record.payroll_month,
      action: "PAYROLL_POST_PAYMENT_DISPUTE_RESOLVED",
      performedBy: resolvedBy,
      targetStaffId: record.staff_id,
      targetPartyId: record.party_id || null,
      notes,
    });

    return {
      success: true,
      phase: "POST_PAYMENT",
      status: PAYROLL_STATUS.RESOLVED,
    };
  }

  throw new Error("Payroll dispute cannot be resolved from the current payroll status");
}
