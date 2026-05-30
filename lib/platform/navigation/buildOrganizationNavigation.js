import {
  generateWorkspaceNavigation,
} from "./generateWorkspaceNavigation";

export async function buildOrganizationNavigation({
  organization,
  activeTenantId,
  userRole = "member",
}) {

  const workspace =
    await generateWorkspaceNavigation(
      activeTenantId
    );

  // ACCOUNTING FIRM MODE

  if (
    organization?.organization_type ===
    "accounting_firm"
  ) {

    return {

      ...workspace,

      organizationMode:
        "accounting_firm",

      sections: [

        {
          id: "clients",
          title: "Client Companies",
          route: "/workspace",
        },

        {
          id: "finance",
          title: "Finance",
          route: "/finance",
        },

        {
          id: "payroll",
          title: "Payroll",
          route: "/payroll",
        },

        {
          id: "analytics",
          title: "Analytics",
          route: "/analytics",
        },

        {
          id: "governance",
          title: "Governance",
          route: "/management",
        },

      ],

    };

  }

  // DIRECT BUSINESS MODE

  return {

    ...workspace,

    organizationMode:
      "direct_business",

  };

}
