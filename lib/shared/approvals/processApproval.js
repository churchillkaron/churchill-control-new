import { canApprove }
from "./canApprove";

import { advanceApproval }
from "./advanceApproval";

import { isValidTransition }
from "./isValidTransition";

export function processApproval({

  type,

  currentStatus,

  role,

}) {

  // 1. permission check

  const allowed =
    canApprove({
      role,
      status: currentStatus,
    });

  if (!allowed) {

    throw new Error(
      "Unauthorized approval"
    );

  }

  // 2. calculate next step

  const nextStatus =
    advanceApproval({
      type,
      currentStatus,
    });

  // 3. validate transition

  const valid =
    isValidTransition({
      type,
      from: currentStatus,
      to: nextStatus,
    });

  if (!valid) {

    throw new Error(
      "Invalid approval transition"
    );

  }

  return {

    previous_status:
      currentStatus,

    next_status:
      nextStatus,

    approved_at:
      new Date().toISOString(),

  };

}