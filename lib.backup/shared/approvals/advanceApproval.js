import { APPROVAL_FLOWS }
from "./approvalFlow";

export function advanceApproval({
  type,
  currentStatus,
}) {

  const flow =
    APPROVAL_FLOWS[type];

  if (!flow) {

    throw new Error(
      `Unknown approval flow: ${type}`
    );

  }

  const currentIndex =
    flow.indexOf(
      currentStatus
    );

  if (currentIndex === -1) {

    throw new Error(
      `Invalid approval status: ${currentStatus}`
    );

  }

  const nextStatus =
    flow[currentIndex + 1];

  return (
    nextStatus ||
    currentStatus
  );

}