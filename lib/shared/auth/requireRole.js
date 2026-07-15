import {
  getServerCurrentUser,
} from "@/lib/platform/administration/identity/runtime/IdentityRuntime";

export async function requireRole({

  role,

}) {

  const user =
    await getServerCurrentUser();

  if (!user) {

    throw new Error(
      "Unauthorized"
    );

  }

  if (
    user.role ===
    "SUPER_ADMIN"
  ) {

    return user;

  }

  if (
    user.role !== role
  ) {

    throw new Error(
      "Forbidden"
    );

  }

  return user;

}
