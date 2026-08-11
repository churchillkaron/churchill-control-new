import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import generateMonthlyPayroll from "@/lib/payroll/consolidation/generateMonthlyPayroll";
import { PAYROLL_STATUS } from "@/lib/payroll/consolidation/payrollStatusMachine";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

export async function recalculatePayrollRecord({
  payrollRecordId,
  organizationId,
  recalculatedBy,
  actorName = "PAYROLL_ADMIN",
  role = "PAYROLL_ADMIN",
}) {
  if (!ALLOWED_ROLES.has(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll recalculation");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!recalculatedBy) throw new Error("recalculatedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (record.status !== PAYROLL_STATUS.REJECTED) {
    throw new Error(
      "Payroll recalculation is only available for a rejected pre-payment payroll month"
    );
  }

  if (!record.entity_id) {
    throw new Error("Payroll legal entity is required for recalculation");
  }

  if (!record.payroll_month) {
    throw new Error("Payroll month is required for recalculation");
  }

  const { data: monthRecords, error: monthError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,status,staff_name")
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month);

  if (monthError) throw monthError;

  const advancedRecord = (monthRecords || []).find(
    (item) =>
      ![
        PAYROLL_STATUS.GENERATED,
        PAYROLL_STATUS.RECALCULATED,
        PAYROLL_STATUS.REJECTED,
      ].includes(item.status)
  );

  if (advancedRecord) {
    throw new Error(
      `Payroll month cannot be recalculated after approval, lock or payment: ${advancedRecord.staff_name || "Employee"} is ${advancedRecord.status}`
    );
  }

  const result = await generateMonthlyPayroll({
    organizationId,
    entityId: record.entity_id,
    payrollMonth: record.payroll_month,
    requestedBy: recalculatedBy,
  });

  const { data: recalculatedRecords, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({ status: PAYROLL_STATUS.RECALCULATED })
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month)
    .eq("status", PAYROLL_STATUS.GENERATED)
    .select("*");

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_RECALCULATED",
    performedBy: actorName,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes: `Payroll month ${record.payroll_month} recalculated after rejection`,
  });

  return {
    success: true,
    payrollMonth: record.payroll_month,
    entityId: record.entity_id,
    recalculatedCount: recalculatedRecords?.length || 0,
    result,
  };
}
