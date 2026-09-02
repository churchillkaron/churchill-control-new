export const ANALYTICS_METRIC_CATALOG_VERSION = "analytics-semantic-v1";

export const ANALYTICS_METRICS = Object.freeze([
  {
    id: "finance.ar.outstanding",
    label: "Receivables outstanding",
    shortLabel: "AR outstanding",
    domain: "finance",
    description: "Open customer invoice balance in the active organisation/entity scope.",
    unit: "currency",
    aggregation: "sum",
    sourceTables: ["customer_invoices"],
    drillPath: "/finance/accounts-receivable",
    freshness: "live",
  },
  {
    id: "finance.ap.outstanding",
    label: "Payables outstanding",
    shortLabel: "AP outstanding",
    domain: "finance",
    description: "Open vendor invoice balance in the active organisation/entity scope.",
    unit: "currency",
    aggregation: "sum",
    sourceTables: ["vendor_invoices"],
    drillPath: "/finance/accounts-payable",
    freshness: "live",
  },
  {
    id: "commercial.orders.open_value",
    label: "Open order value",
    shortLabel: "Open orders",
    domain: "commercial",
    description: "Remaining customer order value that has not yet been settled.",
    unit: "currency",
    aggregation: "sum",
    sourceTables: ["sales_orders"],
    drillPath: "/commercial/sales-orders",
    freshness: "live",
  },
  {
    id: "commercial.quotations.pipeline",
    label: "Quotation pipeline",
    shortLabel: "Quote pipeline",
    domain: "commercial",
    description: "Value of quotations that have not been converted, rejected, cancelled or closed.",
    unit: "currency",
    aggregation: "sum",
    sourceTables: ["commercial_quotations"],
    drillPath: "/commercial/quotations",
    freshness: "live",
  },
  {
    id: "operations.work.open",
    label: "Open operational work",
    shortLabel: "Open work",
    domain: "operations",
    description: "Operational records that have not been completed or closed.",
    unit: "count",
    aggregation: "count",
    sourceTables: ["operations_records"],
    drillPath: "/operations",
    freshness: "live",
  },
  {
    id: "operations.work.overdue",
    label: "Overdue operational work",
    shortLabel: "Overdue work",
    domain: "operations",
    description: "Open operational records whose due time has passed.",
    unit: "count",
    aggregation: "count",
    sourceTables: ["operations_records"],
    drillPath: "/operations",
    freshness: "live",
  },
  {
    id: "supply.inventory.value",
    label: "Inventory value",
    shortLabel: "Inventory value",
    domain: "supply-chain",
    description: "Latest available inventory valuation snapshot per item in scope.",
    unit: "currency",
    aggregation: "latest-per-item-sum",
    sourceTables: ["inventory_valuation_snapshots"],
    drillPath: "/supply-chain/inventory",
    freshness: "snapshot",
  },
  {
    id: "supply.inventory.alerts.open",
    label: "Open inventory alerts",
    shortLabel: "Inventory alerts",
    domain: "supply-chain",
    description: "Inventory alerts that have not been resolved.",
    unit: "count",
    aggregation: "count",
    sourceTables: ["inventory_alerts"],
    drillPath: "/supply-chain/inventory",
    freshness: "live",
  },
  {
    id: "people.attendance.late_minutes_30d",
    label: "Late minutes · 30 days",
    shortLabel: "Late minutes",
    domain: "people",
    description: "Total recorded late minutes over the trailing 30 days.",
    unit: "minutes",
    aggregation: "sum",
    sourceTables: ["staff_attendance"],
    drillPath: "/people/attendance",
    freshness: "live",
  },
  {
    id: "projects.active",
    label: "Active projects",
    shortLabel: "Active projects",
    domain: "projects",
    description: "Projects that remain active by lifecycle and date evidence.",
    unit: "count",
    aggregation: "count",
    sourceTables: ["projects"],
    drillPath: "/projects",
    freshness: "live",
  },
]);

export const ANALYTICS_METRIC_BY_ID = Object.freeze(
  Object.fromEntries(ANALYTICS_METRICS.map((metric) => [metric.id, metric]))
);

export function getAnalyticsMetric(metricId) {
  return ANALYTICS_METRIC_BY_ID[String(metricId || "").trim()] || null;
}

export function listAnalyticsMetrics() {
  return ANALYTICS_METRICS.slice();
}

export function analyticsMetricHref({ organizationId, metric }) {
  if (!organizationId || !metric?.drillPath) return null;
  return `/workspace/${organizationId}${metric.drillPath}`;
}
