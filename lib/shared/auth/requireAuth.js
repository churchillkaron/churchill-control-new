import {
  getServerCurrentUser,
} from "@/lib/platform/administration/identity/runtime/IdentityRuntime";

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
