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

const ARCHIVABLE_STATUSES = new Set([
  PAYROLL_STATUS.CERTIFIED,
  PAYROLL_STATUS.ARCHIVED,
]);

export default async function archivePayrollRecord({
  payrollRecordId,
  organizationId,
  archivedBy,
  role = "OWNER",
}) {
  if (!ALLOWED_ROLES.has(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll archive");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!archivedBy) throw new Error("archivedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!record.entity_id) {
    throw new Error("Payroll legal entity is required before archive");
  }

  if (!record.payroll_month) {
    throw new Error("Payroll month is required before archive");
  }

  if (
    record.status !== PAYROLL_STATUS.ARCHIVED &&
    !canTransition(record.status, PAYROLL_STATUS.ARCHIVED)
  ) {
    throw new Error(
      `Invalid payroll transition from ${record.status} to ARCHIVED`
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
    (item) => !ARCHIVABLE_STATUSES.has(item.status)
  );

  if (invalidStatus) {
    throw new Error(
      `Payroll month must be fully CERTIFIED before archive: ${invalidStatus.staff_name || "Employee"} is ${invalidStatus.status}`
    );
  }

  const missingCertificationEvidence = monthRecords.find(
    (item) =>
      !item.payroll_certified ||
      !item.payroll_certified_by ||
      !item.payroll_certified_at
  );

  if (missingCertificationEvidence) {
    throw new Error(
      `Payroll certification evidence required before archive: ${missingCertificationEvidence.staff_name || "Employee"}`
    );
  }

  const inconsistentArchivedRecord = monthRecords.find(
    (item) =>
      item.status === PAYROLL_STATUS.ARCHIVED &&
      (!item.archived || !item.archived_at || !item.archived_by)
  );

  if (inconsistentArchivedRecord) {
    throw new Error(
      "Payroll month contains an inconsistent archive record; review before retrying"
    );
  }

  const recordsToArchive = monthRecords.filter(
    (item) => item.status === PAYROLL_STATUS.CERTIFIED
  );

  if (recordsToArchive.length === 0) {
    return {
      success: true,
      payrollMonth: record.payroll_month,
      entityId: record.entity_id,
      archivedCount: 0,
      alreadyArchived: true,
      records: monthRecords,
    };
  }

  const archivedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      archived: true,
      archived_at: archivedAt,
      archived_by: String(archivedBy),
      status: PAYROLL_STATUS.ARCHIVED,
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month)
    .eq("status", PAYROLL_STATUS.CERTIFIED)
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
      item.status !== PAYROLL_STATUS.ARCHIVED ||
      !item.archived ||
      !item.archived_at ||
      !item.archived_by
  );

  if (incomplete) {
    throw new Error(
      "Payroll month changed during archive; refresh and review before retrying"
    );
  }

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_MONTH_ARCHIVED",
    performedBy: String(archivedBy),
    notes: `Archived ${(updated || []).length} payroll records for ${record.payroll_month}`,
  });

  return {
    success: true,
    payrollMonth: record.payroll_month,
    entityId: record.entity_id,
    archivedCount: (updated || []).length,
    alreadyArchived: false,
    records: finalRecords || [],
  };
}
