import loadTenantPayoutPolicy from "@/lib/payroll/policies/loadTenantPayoutPolicy";

export default async function calculateDailyPayouts({
  organizationId,
  serviceCharge = 0,
  staffPerformance = [],
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const policy = await loadTenantPayoutPolicy(organizationId);
  const payoutModel = policy?.payout_model || "EQUAL";

  if (payoutModel === "EQUAL") {
    const eligibleStaff = staffPerformance.filter(
      (member) =>
        Number(member.totalHours || 0) > 0 ||
        Number(member.completedShifts || 0) > 0
    );

    const split = serviceCharge / Math.max(1, eligibleStaff.length);

    return staffPerformance.map((member) => {
      const multiplier = policy?.performance_enabled
        ? Number(member.multiplier || 1)
        : 1;
      const eligible =
        Number(member.totalHours || 0) > 0 ||
        Number(member.completedShifts || 0) > 0;

      return {
        ...member,
        payout: eligible
          ? Number((split * multiplier).toFixed(2))
          : 0,
      };
    });
  }

  const departmentPercentages = {
    FOH: Number(policy?.foh_percentage || 0),
    PRODUCTION: Number(policy?.bar_percentage || 0),
    FULFILLMENT: Number(policy?.kitchen_percentage || 0),
  };

  return staffPerformance.map((member) => {
    const department = member.department || "UNASSIGNED";
    const eligibleDepartmentStaff = staffPerformance.filter(
      (row) => row.department === department
    );
    const departmentPool =
      serviceCharge *
      (Number(departmentPercentages[department] || 0) / 100);
    const multiplier = policy?.performance_enabled
      ? Number(member.multiplier || 1)
      : 1;
    const eligible =
      Number(member.totalHours || 0) > 0 ||
      Number(member.completedShifts || 0) > 0;

    const payout = eligible
      ? (departmentPool / Math.max(1, eligibleDepartmentStaff.length)) * multiplier
      : 0;

    return {
      ...member,
      departmentLevel: "NORMAL",
      departmentMultiplier: 1,
      payout: Number(payout.toFixed(2)),
    };
  });
}
