export const PAYROLL_STATUS = {

  GENERATED:
    "GENERATED",

  APPROVED:
    "APPROVED",

  REJECTED:
    "REJECTED",

  RECALCULATED:
    "RECALCULATED",

  LOCKED:
    "LOCKED",

  PAID:
    "PAID",

  DISPUTED:
    "DISPUTED",

  RESOLVED:
    "RESOLVED",

  FINALIZED:
    "FINALIZED",

  ACCOUNTING_CLOSED:
    "ACCOUNTING_CLOSED",

  CERTIFIED:
    "CERTIFIED",

  ARCHIVED:
    "ARCHIVED",

};

export const PAYROLL_TRANSITIONS = {

  GENERATED: [
    "APPROVED",
    "REJECTED",
  ],

  REJECTED: [
    "RECALCULATED",
  ],

  RECALCULATED: [
    "APPROVED",
    "REJECTED",
  ],

  APPROVED: [
    "LOCKED",
  ],

  LOCKED: [
    "PAID",
  ],

  PAID: [
    "DISPUTED",
    "FINALIZED",
  ],

  DISPUTED: [
    "RESOLVED",
    "RECALCULATED",
  ],

  RESOLVED: [
    "FINALIZED",
  ],

  FINALIZED: [
    "ACCOUNTING_CLOSED",
  ],

  ACCOUNTING_CLOSED: [
    "CERTIFIED",
  ],

  CERTIFIED: [
    "ARCHIVED",
  ],

  ARCHIVED: [],

};

export function canTransition(

  currentStatus,
  nextStatus

) {

  const allowed =

    PAYROLL_TRANSITIONS[
      currentStatus
    ] || [];

  return allowed.includes(
    nextStatus
  );

}
