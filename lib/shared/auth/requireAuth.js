import {
  getServerCurrentUser,
} from "@/lib/auth/getServerCurrentUser";

export async function requireAuth() {

  const user =
    await getServerCurrentUser();

  if (!user) {

    throw new Error(
      "Unauthorized"
    );

  }

  return user;

}
