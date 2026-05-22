import {
  PAYROLL_STATUS,
  PAYROLL_TRANSITIONS,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

import approvePayrollRecord
from "@/lib/payroll/consolidation/approvePayrollRecord";

import rejectPayrollRecord
from "@/lib/payroll/consolidation/rejectPayrollRecord";

import recalculatePayrollRecord
from "@/lib/payroll/consolidation/recalculatePayrollRecord";

import lockPayrollRecord
from "@/lib/payroll/consolidation/lockPayrollRecord";

import processPayrollPayout
from "@/lib/payroll/consolidation/processPayrollPayout";

import finalizePayrollRecord
from "@/lib/payroll/consolidation/finalizePayrollRecord";

import closePayrollAccountingPeriod
from "@/lib/payroll/consolidation/closePayrollAccountingPeriod";

import certifyPayrollRecord
from "@/lib/payroll/consolidation/certifyPayrollRecord";

import archivePayrollRecord
from "@/lib/payroll/consolidation/archivePayrollRecord";

export const PAYROLL_ACTIONS = {

  APPROVE: {

    label:
      "APPROVE",

    nextStatus:
      PAYROLL_STATUS.APPROVED,

    roles: [

      "OWNER",

      "ACCOUNTING_ADMIN",

      "PAYROLL_ADMIN",

      "MANAGER",

    ],

    handler:
      approvePayrollRecord,

  },

  REJECT: {

    label:
      "REJECT",

    nextStatus:
      PAYROLL_STATUS.REJECTED,

    roles: [

      "OWNER",

      "ACCOUNTING_ADMIN",

      "PAYROLL_ADMIN",

      "MANAGER",

    ],

    handler:
      rejectPayrollRecord,

  },

  RECALCULATE: {

    label:
      "RECALCULATE",

    nextStatus:
      PAYROLL_STATUS.RECALCULATED,

    roles: [

      "OWNER",

      "ACCOUNTING_ADMIN",

      "PAYROLL_ADMIN",

    ],

    handler:
      recalculatePayrollRecord,

  },

  LOCK: {

    label:
      "LOCK",

    nextStatus:
      PAYROLL_STATUS.LOCKED,

    roles: [

      "OWNER",

      "ACCOUNTING_ADMIN",

      "PAYROLL_ADMIN",

    ],

    handler:
      lockPayrollRecord,

  },

  PAYOUT: {

    label:
      "PAYOUT",

    nextStatus:
      PAYROLL_STATUS.PAID,

    roles: [

      "OWNER",

      "ACCOUNTING_ADMIN",

      "PAYROLL_ADMIN",

    ],

    handler:
      processPayrollPayout,

  },

  FINALIZE: {

    label:
      "FINALIZE",

    nextStatus:
      PAYROLL_STATUS.FINALIZED,

    roles: [

      "OWNER",

      "ACCOUNTING_ADMIN",

      "PAYROLL_ADMIN",

    ],

    handler:
      finalizePayrollRecord,

  },

  ACCOUNTING_CLOSE: {

    label:
      "ACCOUNTING CLOSE",

    nextStatus:
      PAYROLL_STATUS.ACCOUNTING_CLOSED,

    roles: [

      "OWNER",

      "ACCOUNTING_ADMIN",

    ],

    handler:
      closePayrollAccountingPeriod,

  },

  CERTIFY: {

    label:
      "CERTIFY",

    nextStatus:
      PAYROLL_STATUS.CERTIFIED,

    roles: [

      "OWNER",

      "ACCOUNTING_ADMIN",

    ],

    handler:
      certifyPayrollRecord,

  },

  ARCHIVE: {

    label:
      "ARCHIVE",

    nextStatus:
      PAYROLL_STATUS.ARCHIVED,

    roles: [

      "OWNER",

      "ACCOUNTING_ADMIN",

    ],

    handler:
      archivePayrollRecord,

  },

};

export function getAllowedPayrollActions({

  currentStatus,

  role = "STAFF",

}) {

  const allowedStatuses =

    PAYROLL_TRANSITIONS[
      currentStatus
    ] || [];

  return Object.entries(
    PAYROLL_ACTIONS
  )

    .filter(
      ([, action]) =>

        allowedStatuses.includes(
          action.nextStatus
        ) &&

        action.roles.includes(
          role
        )
    )

    .map(
      ([key, action]) => ({

        key,

        ...action,

      })
    );

}
