const OrganizationSetupWorkspace = {
  id: "organization_setup",
  name: "Organization Setup",
  route: "/administration/onboarding",
  description: "Complete or skip the organization setup checklist across brand, modules, people, channels, payments, integrations and security.",
  order: 1,
  status: "active",
  type: "business-workspace",
  document: "OrganizationSetup",
  runtime: { renderer: "OrganizationSetupWorkCenter" },
};

export default OrganizationSetupWorkspace;
