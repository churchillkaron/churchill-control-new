/**
 * AVANTIQO SYSTEM → MODULE MAPPING
 * CONNECTS REAL CODEBASE TO MODULE REGISTRY
 */

export const SYSTEM_MODULE_MAP = {
  // =========================
  // POS SYSTEM
  // =========================
  pos: [
    "/pos",
    "/pos/orders",
    "/pos/payments",
    "/pos/tables",
    "/pos/receipts",
    "/pos/shifts",
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
    "/marketing/design",
    "/marketing/operations",
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
