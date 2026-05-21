const MODULE_PERMISSIONS = {

  pos: [

    "orders.create",
    "orders.update",
    "orders.cancel",
    "payments.process",

  ],

  inventory: [

    "inventory.read",
    "inventory.adjust",
    "inventory.transfer",

  ],

  finance: [

    "finance.read",
    "finance.approve",
    "finance.close",

  ],

  accounting: [

    "journals.create",
    "journals.approve",
    "period.close",

  ],

  procurement: [

    "po.create",
    "po.approve",
    "supplier.manage",

  ],

  payroll: [

    "payroll.view",
    "payroll.process",
    "attendance.manage",

  ],

  analytics: [

    "analytics.read",
    "forecasting.read",

  ],

  marketing_ai: [

    "campaign.create",
    "campaign.publish",

  ],

  owner_ai: [

    "ai.executive",
    "ai.recommendations",

  ],

  projects: [

    "projects.create",
    "projects.manage",
    "timeline.manage",

  ],

};

export function generatePermissions(
  modules = []
) {

  const permissions =
    new Set();

  modules.forEach(
    module => {

      const modulePermissions =
        MODULE_PERMISSIONS[
          module.module_id
        ] || [];

      modulePermissions.forEach(
        permission => {

          permissions.add(
            permission
          );

        }
      );

    }
  );

  return Array.from(
    permissions
  );

}
