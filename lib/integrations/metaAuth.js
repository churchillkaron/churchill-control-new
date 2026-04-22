export function getMetaConfig() {
  return {
    clientId: process.env.META_APP_ID,
    clientSecret: process.env.META_APP_SECRET,
    redirectUri: "http://localhost:3000/api/meta/auth/callback",
  };
}

export function getMetaAuthUrl() {
  const { clientId, redirectUri } = getMetaConfig();

  const scopes = ["public_profile"];

  const url =
    `https://www.facebook.com/v18.0/dialog/oauth` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scopes.join(",")}` +
    `&response_type=code`;

  return url;
}

export async function exchangeMetaCode(code) {
  const { clientId, clientSecret, redirectUri } = getMetaConfig();

  const tokenUrl =
    `https://graph.facebook.com/v18.0/oauth/access_token` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&client_secret=${clientSecret}` +
    `&code=${code}`;

  const res = await fetch(tokenUrl);
  const data = await res.json();

  return data;
}