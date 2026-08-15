import crypto from "node:crypto";

function text(value) {
  return String(value ?? "").trim();
}

function callbackOrigin() {
  return new URL(
    process.env.SOCIAL_OAUTH_CALLBACK_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://avantiqo.ai",
  ).origin;
}

const CONFIG = {
  linkedin: {
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: [
      "r_basicprofile",
      "rw_organization_admin",
      "w_organization_social",
      "r_organization_social",
      "w_organization_social_feed",
      "r_organization_social_feed",
    ],
    identityUrl: "https://api.linkedin.com/v2/me",
    pkce: false,
  },
  tiktok: {
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.list", "video.upload", "video.publish"],
    identityUrl:
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username",
    pkce: false,
  },
  threads: {
    clientIdEnv: "THREADS_APP_ID",
    clientSecretEnv: "THREADS_APP_SECRET",
    authorizeUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: [
      "threads_basic",
      "threads_content_publish",
      "threads_manage_insights",
      "threads_read_replies",
      "threads_manage_replies",
    ],
    identityUrl:
      "https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url",
    pkce: false,
  },
  x: {
    clientIdEnv: "X_CLIENT_ID",
    clientSecretEnv: "X_CLIENT_SECRET",
    authorizeUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: [
      "tweet.read",
      "tweet.write",
      "users.read",
      "media.write",
      "offline.access",
    ],
    identityUrl:
      "https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url",
    pkce: true,
  },
};

export function getSocialOAuthConfig(provider) {
  const config = CONFIG[text(provider).toLowerCase()] || null;
  if (!config) return null;
  return { ...config, provider: text(provider).toLowerCase() };
}

export function getSocialOAuthCallbackUrl(provider) {
  return `${callbackOrigin()}/api/social/${encodeURIComponent(provider)}/auth/callback`;
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function buildSocialAuthorizationUrl({ provider, state, codeChallenge = null }) {
  const config = getSocialOAuthConfig(provider);
  if (!config) throw new Error("Unsupported social connection");
  const clientId = text(process.env[config.clientIdEnv]);
  if (!clientId) throw new Error(`${config.clientIdEnv} is not configured`);

  const url = new URL(config.authorizeUrl);
  const callbackUrl = getSocialOAuthCallbackUrl(provider);

  if (provider === "tiktok") {
    url.searchParams.set("client_key", clientId);
  } else {
    url.searchParams.set("client_id", clientId);
  }
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", config.scopes.join(provider === "tiktok" ? "," : " "));

  if (config.pkce) {
    if (!codeChallenge) throw new Error("PKCE challenge required");
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }

  return url;
}

export async function exchangeSocialAuthorizationCode({
  provider,
  code,
  codeVerifier = null,
}) {
  const config = getSocialOAuthConfig(provider);
  if (!config) throw new Error("Unsupported social connection");
  const clientId = text(process.env[config.clientIdEnv]);
  const clientSecret = config.clientSecretEnv
    ? text(process.env[config.clientSecretEnv])
    : "";
  if (!clientId) throw new Error(`${config.clientIdEnv} is not configured`);
  if (config.clientSecretEnv && provider !== "x" && !clientSecret) {
    throw new Error(`${config.clientSecretEnv} is not configured`);
  }

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", getSocialOAuthCallbackUrl(provider));

  if (provider === "tiktok") {
    body.set("client_key", clientId);
    body.set("client_secret", clientSecret);
  } else {
    body.set("client_id", clientId);
    if (clientSecret) body.set("client_secret", clientSecret);
  }
  if (config.pkce) {
    if (!codeVerifier) throw new Error("PKCE verifier missing");
    body.set("code_verifier", codeVerifier);
  }

  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (provider === "x" && clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    body.delete("client_secret");
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const tokenPayload = payload?.data && !payload.access_token ? payload.data : payload;
  if (!response.ok || !tokenPayload?.access_token) {
    throw new Error(
      tokenPayload?.error_description ||
        tokenPayload?.message ||
        payload?.error?.message ||
        "Provider access-token exchange failed",
    );
  }
  return tokenPayload;
}

export async function fetchSocialIdentity({ provider, accessToken }) {
  const config = getSocialOAuthConfig(provider);
  if (!config) throw new Error("Unsupported social connection");
  const response = await fetch(config.identityUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || "Provider identity verification failed");
  }

  if (provider === "tiktok") {
    const user = payload?.data?.user || payload?.data || payload;
    const id = text(user?.open_id || user?.union_id);
    if (!id) throw new Error("TikTok identity could not be verified");
    return { id, username: text(user?.username), name: text(user?.display_name), raw: user };
  }
  if (provider === "linkedin") {
    const id = text(payload?.id);
    if (!id) throw new Error("LinkedIn identity could not be verified");
    const firstName = text(payload?.localizedFirstName);
    const lastName = text(payload?.localizedLastName);
    return {
      id,
      username: text(payload?.vanityName) || null,
      name: [firstName, lastName].filter(Boolean).join(" ") || null,
      raw: payload,
    };
  }
  const user = payload?.data || payload;
  const id = text(user?.id);
  if (!id) throw new Error(`${provider} identity could not be verified`);
  return {
    id,
    username: text(user?.username),
    name: text(user?.name || user?.username),
    raw: user,
  };
}
