import {
  PAYROLL_ACTIONS,
} from "@/lib/payroll/consolidation/payrollActions";

export async function executePayrollAction({

  action,

  payrollRecordId,

  role = "OWNER",

  actor = "SYSTEM",

}) {

  const config =
    PAYROLL_ACTIONS[action];

  if (!config) {

    throw new Error(
      `Unknown payroll action: ${action}`
    );

  }

  if (
    !config.roles.includes(
      role
    )
  ) {

    throw new Error(
      `Unauthorized payroll action: ${action}`
    );

  }

  return config.handler({

    payrollRecordId,

    role,

    approvedBy:
      actor,

    rejectedBy:
      actor,

    recalculatedBy:
      actor,

    lockedBy:
      actor,

    processedBy:
      actor,

    finalizedBy:
      actor,

    closedBy:
      actor,

    certifiedBy:
      actor,

    archivedBy:
      actor,

  });

}
