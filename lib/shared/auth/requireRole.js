import {
  getServerCurrentUser,
} from "@/lib/auth/getServerCurrentUser";

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
