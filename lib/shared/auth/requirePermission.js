import {
  getServerCurrentUser,
} from "@/lib/platform/administration/identity/runtime/IdentityRuntime";

import checkPermission
from "@/lib/platform/administration/identity/runtime/IdentityRuntime";

export async function requirePermission(
  permission_key
) {
  const user =
    await getServerCurrentUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const permission =
    await checkPermission({
      organization_id:
        user.organization_id,
      entity_id:
        user.entity_id || null,
      user_id:
        user.id,
      permission_key,
    });

  if (!permission.allowed) {
    throw new Error("Forbidden");
  }

  return user;
}
