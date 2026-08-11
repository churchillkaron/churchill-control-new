const PayrollSetupWorkspace = {
  id: "payroll_setup",
  name: "Payroll Setup",
  route: "/administration/onboarding/payroll",
  description:
    "Configure legal entity, payroll policy, employee compensation, schedules and attendance before the first payroll run.",
  order: 10,
  status: "active",
  type: "operational-workspace",
  document: "PayrollSetup",
  create: {
    enabled: false,
  },
  tags: [
    "onboarding",
    "setup",
    "payroll",
    "compensation",
    "scheduling",
    "attendance",
  ],
};

export default PayrollSetupWorkspace;
