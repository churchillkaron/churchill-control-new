const DASHBOARD_WIDGETS = {

  pos: [

    "live_orders",
    "table_status",
    "kitchen_flow",
    "service_speed",

  ],

  inventory: [

    "inventory_value",
    "low_stock",
    "waste_tracking",

  ],

  finance: [

    "cashflow",
    "revenue",
    "profit_loss",

  ],

  accounting: [

    "journal_status",
    "period_close",
    "approvals",

  ],

  procurement: [

    "purchase_orders",
    "supplier_alerts",
    "receiving",

  ],

  payroll: [

    "labor_cost",
    "attendance",
    "salary_approvals",

  ],

  analytics: [

    "forecasting",
    "kpi_overview",
    "anomaly_detection",

  ],

  marketing_ai: [

    "campaign_queue",
    "ai_recommendations",
    "social_performance",

  ],

  owner_ai: [

    "executive_summary",
    "ai_alerts",
    "business_health",

  ],

  projects: [

    "project_timeline",
    "resource_tracking",
    "risk_analysis",

  ],

};

export function generateDashboard(
  modules = []
) {

  const widgets =
    new Set();

  modules.forEach(
    module => {

      const moduleWidgets =
        DASHBOARD_WIDGETS[
          module.module_id
        ] || [];

      moduleWidgets.forEach(
        widget => {

          widgets.add(
            widget
          );

        }
      );

    }
  );

  return Array.from(
    widgets
  );

}
