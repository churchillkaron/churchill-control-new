import { APPROVAL_FLOWS }
from "./approvalFlow";

export function isValidTransition({

  type,

  from,

  to,

}) {

  const flow =
    APPROVAL_FLOWS[type];

  if (!flow) {

    return false;

  }

  const currentIndex =
    flow.indexOf(from);

  const nextIndex =
    flow.indexOf(to);

  if (
    currentIndex === -1 ||
    nextIndex === -1
  ) {

    return false;

  }

  // only allow moving
  // one step forward

  return (
    nextIndex ===
    currentIndex + 1
  );

}