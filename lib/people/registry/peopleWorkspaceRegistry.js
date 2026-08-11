const PAYROLL_GROUP_ID = "payroll";

const PEOPLE_PAYROLL_WORKSPACES = [
  {
    id: "payroll_runs",
    name: "Payroll Control",
    route: "/people/payroll",
    description:
      "Generate payroll and monitor readiness, approvals, locks and payment exposure.",
    order: 10,
    status: "active",
    type: "business-workspace",
    document: "PayrollRun",
  },
  {
    id: "payroll_governance",
    name: "Payroll Governance",
    route: "/people/payroll/governance",
    description:
      "Approve, reject, lock, finalize, close, certify and archive payroll records.",
    order: 20,
    status: "active",
    type: "business-workspace",
    document: "PayrollRun",
  },
  {
    id: "payroll_payments",
    name: "Payroll Payments",
    route: "/people/payroll/payments",
    description:
      "Prepare payroll payment batches and reconcile them against payment references.",
    order: 30,
    status: "active",
    type: "business-workspace",
    document: "PayrollPayment",
  },
  {
    id: "compensation",
    name: "Compensation",
    route: "/people/compensation",
    description:
      "Configure salary, hourly rates, payroll frequency and payment profiles.",
    order: 40,
  },
  {
    id: "payroll_setup",
    name: "Payroll Setup",
    route: "/administration/onboarding/payroll",
    description:
      "Prepare legal entity, policy, compensation, scheduling and attendance prerequisites before payroll go-live.",
    order: 50,
  },
];

export function applyPeopleWorkspaceRegistry(registry) {
  const people = registry?.workspaces?.people;
  if (!people) return registry;

  const payrollGroup = (people.groups || []).find(
    (group) => group?.id === PAYROLL_GROUP_ID
  );

  if (!payrollGroup) return registry;

  payrollGroup.items = PEOPLE_PAYROLL_WORKSPACES.map((item) => ({ ...item }));

  return registry;
}

export default applyPeopleWorkspaceRegistry;
