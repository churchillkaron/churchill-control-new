import {
  getServerCurrentUser,
} from "@/lib/auth/getServerCurrentUser";

import checkPermission
from "@/lib/permissions/checkPermission";

export async function requirePermission(
  permission_key
) {

  const user =
    await getServerCurrentUser();

  if (!user) {

    throw new Error(
      "Unauthorized"
    );

  }

  const permission =
    await checkPermission({

      tenant_id:
        user.tenant_id,

      user_id:
        user.id,

      permission_key,

    });

  if (
    !permission.allowed
  ) {

    throw new Error(
      "Forbidden"
    );

  }

  return user;

}
