import { supabase } from "@/lib/supabase";

export async function runCloseChecklist({
  tenantId,
  accountingPeriodId,
}) {
  const checklist = [
    "All journals posted",
    "Subledgers reconciled",
    "Bank reconciliation completed",
    "Inventory reconciled",
    "Payroll posted",
    "AP reconciled",
    "AR reconciled",
    "Trial balance balanced",
    "Financial statements generated",
    "Audit review completed",
  ];

  const rows = checklist.map((item) => ({
    tenant_id: tenantId,
    accounting_period_id: accountingPeriodId,
    checklist_item: item,
    completed: false,
  }));

  const { data, error } = await supabase
    .from("accounting_close_checklists")
    .insert(rows)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
