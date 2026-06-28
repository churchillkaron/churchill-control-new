/**
 * AVANTIQO SYSTEM → MODULE MAPPING
 * CONNECTS REAL CODEBASE TO MODULE REGISTRY
 */

export const SYSTEM_MODULE_MAP = {
  // =========================
  // POS SYSTEM
  // =========================
  pos: [
    "/operations/pos",
    "/operations/pos/orders",
    "/operations/pos/payments",
    "/operations/pos/tables",
    "/operations/pos/receipts",
    "/operations/pos/shifts",
  ],

  // =========================
  // FINANCE
  // =========================
  finance: [
    "/finance",
    "/finance/accounting",
    "/finance/invoice-review",
    "/finance/reconciliation",
    "/finance/periods",
  ],

  // =========================
  // HEALTHCARE
  // =========================
  healthcare: [
    "/workspace/*/healthcare/patients",
    "/workspace/*/healthcare/appointments",
  ],

  // =========================
  // MARKETING
  // =========================
  marketing: [
    "/commercial/marketing/design",
    "/commercial/marketing/operations",
  ],

  // =========================
  // INVENTORY
  // =========================
  inventory: [
    "/inventory",
    "/procurement",
    "/inventory/ledger",
    "/inventory/replenishment",
  ],

  // =========================
  // WORKFORCE
  // =========================
  workforce: [
    "/management/staff",
    "/payroll",
    "/performance",
    "/schedule",
  ],

  // =========================
  // AUTOMATION
  // =========================
  automation: [
    "/automation",
    "/approvals",
    "/workflows",
  ],

  // =========================
  // INTELLIGENCE
  // =========================
  intelligence: [
    "/dashboard",
    "/analytics",
    "/monitoring",
  ],
};
