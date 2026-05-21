import {
  getCurrentUser,
} from "@/lib/auth/getCurrentUser";

import {
  checkPermission,
} from "@/lib/shared/auth/checkPermission";

export async function requirePermission(
  permission
) {

  const user =
    await getCurrentUser();

  if (!user) {

    throw new Error(
      "Unauthorized"
    );

  }

  const allowed =
    checkPermission(
      user,
      permission
    );

  if (!allowed) {

    throw new Error(
      "Forbidden"
    );

  }

  return user;

}
