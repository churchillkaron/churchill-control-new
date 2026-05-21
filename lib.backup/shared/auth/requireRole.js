import {
  getCurrentUser,
} from "@/lib/auth/getCurrentUser";

export async function requireRole({

  role,

}) {

  const user =
    await getCurrentUser();

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
