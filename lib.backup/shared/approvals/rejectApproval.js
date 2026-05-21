import { APPROVAL_STATUS }
from "@/lib/shared/constants/statuses";

export function rejectApproval({

  reason,

  rejectedBy,

}) {

  return {

    status:
      APPROVAL_STATUS.REJECTED,

    rejected_reason:
      reason || null,

    rejected_by:
      rejectedBy || null,

    rejected_at:
      new Date().toISOString(),

  };

}