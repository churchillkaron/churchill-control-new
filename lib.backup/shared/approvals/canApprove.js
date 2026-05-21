import { ROLES }
from "@/lib/shared/constants/roles";

export function canApprove({
  role,
  status,
}) {

  if (
    status ===
    "pending_manager"
  ) {

    return [
      ROLES.MANAGER,
      ROLES.OWNER,
    ].includes(role);

  }

  if (
    status ===
    "pending_accounting"
  ) {

    return [
      ROLES.ACCOUNTING,
      ROLES.OWNER,
    ].includes(role);

  }

  if (
    status ===
    "pending_owner"
  ) {

    return role ===
      ROLES.OWNER;

  }

  return false;

}