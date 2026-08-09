import { google }
from "googleapis";

export function getOAuthClient({ origin = null } = {}) {

  const baseUrl =
    origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${new URL(baseUrl).origin}/api/google/auth/callback`
  );

}
