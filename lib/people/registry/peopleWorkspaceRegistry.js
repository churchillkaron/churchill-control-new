const WORKFORCE_GROUP_ID = "workforce";
const PAYROLL_GROUP_ID = "payroll";

const PEOPLE_WORKFORCE_WORKSPACES = [
  {
    id: "employees",
    name: "Employees",
    route: "/people/directory",
    description:
      "Manage employee records, portal access and canonical staff profiles.",
    order: 10,
    status: "active",
    type: "business-workspace",
    document: "Employee",
  },
  {
    id: "attendance",
    name: "Attendance",
    route: "/people/attendance",
    description:
      "Review shift evidence, lateness and absence reconciliation before payroll.",
    order: 20,
    status: "active",
    type: "business-workspace",
    document: "AttendanceRecord",
  },
  {
    id: "workforce_requests",
    name: "Time Off & Swaps",
    route: "/people/requests",
    description:
      "Review time-off requests and approved future roster transfers.",
    order: 30,
    status: "active",
    type: "business-workspace",
    document: "WorkforceRequest",
  },
  {
    id: "scheduling",
    name: "Scheduling",
    route: "/people/scheduling",
    description:
      "Publish and manage organization work schedules and shifts.",
    order: 40,
    status: "active",
    type: "business-workspace",
    document: "StaffSchedule",
  },
  {
    id: "workforce_calendar",
    name: "Workforce Calendar",
    route: "/people/calendar",
    description:
      "Maintain legal-entity public holidays, closures and working-day overrides used by workforce and payroll reconciliation.",
    order: 50,
    status: "active",
    type: "business-workspace",
    document: "WorkforceCalendarDay",
  },
];

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
    id: "payroll_preview",
    name: "Payroll Preview",
    route: "/people/payroll/preview",
    description:
      "Calculate payroll with canonical inputs and formulas without creating or changing payroll records.",
    order: 15,
    status: "active",
    type: "business-workspace",
    document: "PayrollPreview",
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
    id: "payroll_policy",
    name: "Payroll Policy",
    route: "/people/payroll/policy",
    description:
      "Configure organization payroll identity, work expectations and runtime rules.",
    order: 45,
    status: "active",
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

  const groups = people.groups || [];
  const workforceGroup = groups.find(
    (group) => group?.id === WORKFORCE_GROUP_ID
  );
  const payrollGroup = groups.find(
    (group) => group?.id === PAYROLL_GROUP_ID
  );

  if (workforceGroup) {
    workforceGroup.items = PEOPLE_WORKFORCE_WORKSPACES.map((item) => ({
      ...item,
    }));
  }

  if (payrollGroup) {
    payrollGroup.items = PEOPLE_PAYROLL_WORKSPACES.map((item) => ({ ...item }));
  }

  return registry;
}

export default applyPeopleWorkspaceRegistry;
