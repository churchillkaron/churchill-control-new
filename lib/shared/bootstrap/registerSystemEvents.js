import "@/lib/payments/workflows/paymentCompletedWorkflow";
import "@/lib/accounts-payable/workflows/invoiceApprovedWorkflow";
import "@/lib/procurement/workflows/registerProcurementWorkflows";

export function registerSystemEvents() {
  return {
    success: true,
    registered: true,
  };
}
