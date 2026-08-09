import { google } from "googleapis";

export function getGoogleOAuthCallbackOrigin() {
  const configured =
    process.env.GOOGLE_OAUTH_CALLBACK_ORIGIN ||
    "https://avantiqo.ai";

  return new URL(configured).origin;
}

export function getOAuthClient({ origin = null } = {}) {
  const baseUrl = origin || getGoogleOAuthCallbackOrigin();

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${new URL(baseUrl).origin}/api/google/auth/callback`
  );
}
