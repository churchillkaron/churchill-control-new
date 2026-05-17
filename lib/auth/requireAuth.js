import { cookies } from "next/headers";
import getSession from "./getSession";

export default async function requireAuth() {
  const cookieStore = cookies();

  const accessToken =
    cookieStore.get(
      "sb-access-token"
    )?.value;

  if (!accessToken) {
    return {
      authenticated: false,
    };
  }

  return await getSession(accessToken);
}
