import {
  PAYROLL_STATUS,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

const IMMUTABLE_STATES = [

  PAYROLL_STATUS.ARCHIVED,

];

export default function isPayrollImmutable(

  payrollStatus

) {

  return IMMUTABLE_STATES.includes(
    payrollStatus
  );

}
