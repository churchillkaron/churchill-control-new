import {
  getCurrentUser,
} from "@/lib/auth/getCurrentUser";

export async function requireAuth() {

  const user =
    await getCurrentUser();

  if (!user) {

    throw new Error(
      "Unauthorized"
    );

  }

  return user;

}
