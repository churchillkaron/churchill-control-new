const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_API = "https://graph.microsoft.com/v1.0";
const MICROSOFT_SUBSCRIPTION_MINUTES = 10020;

function text(value) {
  return String(value ?? "").trim();
}

function appOrigin() {
  return new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      process.env.GOOGLE_EMAIL_OAUTH_CALLBACK_ORIGIN ||
      process.env.MICROSOFT_EMAIL_OAUTH_CALLBACK_ORIGIN ||
      "https://avantiqo.ai",
  ).origin;
}

async function refreshGoogleCredential(credential) {
  if (!text(credential?.refresh_token)) return credential;
  const clientId = text(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = text(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) return credential;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credential.refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !text(payload?.access_token)) {
    throw new Error(payload?.error_description || "GOOGLE_EMAIL_TOKEN_REFRESH_FAILED");
  }
  return { ...credential, ...payload };
}

async function refreshMicrosoftCredential(credential) {
  if (!text(credential?.refresh_token)) return credential;
  const clientId = text(process.env.MICROSOFT_CLIENT_ID);
  const clientSecret = text(process.env.MICROSOFT_CLIENT_SECRET);
  if (!clientId || !clientSecret) return credential;
  const tenant = text(process.env.MICROSOFT_TENANT_ID) || "common";

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credential.refresh_token,
        grant_type: "refresh_token",
        scope: "offline_access User.Read Mail.ReadWrite Mail.Send",
      }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !text(payload?.access_token)) {
    throw new Error(payload?.error_description || "MICROSOFT_EMAIL_TOKEN_REFRESH_FAILED");
  }
  return { ...credential, ...payload };
}

async function googleRequest(input) {
  let credential = input;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const topicName = text(process.env.GOOGLE_EMAIL_PUBSUB_TOPIC);
    if (!topicName) throw new Error("GOOGLE_EMAIL_PUBSUB_TOPIC_REQUIRED");

    const response = await fetch(`${GMAIL_API}/watch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${text(credential.access_token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName,
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && text(payload?.historyId)) {
      return {
        mode: "GMAIL_PUBSUB",
        history_id: text(payload.historyId),
        expiration: text(payload.expiration) || null,
      };
    }
    if (response.status === 401 && attempt === 0 && text(credential.refresh_token)) {
      credential = await refreshGoogleCredential(credential);
      continue;
    }
    throw new Error(payload?.error?.message || `GMAIL_WATCH_FAILED:${response.status}`);
  }
  throw new Error("GMAIL_WATCH_FAILED");
}

function microsoftExpiration() {
  return new Date(Date.now() + MICROSOFT_SUBSCRIPTION_MINUTES * 60 * 1000).toISOString();
}

async function graphRequest(url, options, credential) {
  let current = credential;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${text(current.access_token)}`,
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      cache: "no-store",
    });
    const payload = response.status === 204
      ? {}
      : await response.json().catch(() => ({}));
    if (response.ok) return { payload, credential: current };
    if (response.status === 401 && attempt === 0 && text(current.refresh_token)) {
      current = await refreshMicrosoftCredential(current);
      continue;
    }
    const error = new Error(payload?.error?.message || `MICROSOFT_SUBSCRIPTION_FAILED:${response.status}`);
    error.status = response.status;
    throw error;
  }
  throw new Error("MICROSOFT_SUBSCRIPTION_FAILED");
}

async function createMicrosoftSubscription(input, credential) {
  const clientState = text(input.client_state);
  if (!clientState) throw new Error("MICROSOFT_EMAIL_CLIENT_STATE_REQUIRED");
  const notificationUrl = `${appOrigin()}/api/email/microsoft/push`;
  const result = await graphRequest(
    `${GRAPH_API}/subscriptions`,
    {
      method: "POST",
      body: JSON.stringify({
        changeType: "created,updated",
        notificationUrl,
        lifecycleNotificationUrl: notificationUrl,
        resource: "me/mailFolders('inbox')/messages",
        expirationDateTime: microsoftExpiration(),
        clientState,
      }),
    },
    credential,
  );

  const subscriptionId = text(result.payload?.id);
  if (!subscriptionId) throw new Error("MICROSOFT_SUBSCRIPTION_ID_MISSING");
  return {
    mode: "MICROSOFT_GRAPH_WEBHOOK",
    subscription_id: subscriptionId,
    expiration: text(result.payload?.expirationDateTime) || null,
    resource: text(result.payload?.resource) || "me/mailFolders('inbox')/messages",
    created: true,
  };
}

async function microsoftRequest(input) {
  let credential = input;
  const subscriptionId = text(input.subscription_id);
  if (subscriptionId) {
    try {
      const result = await graphRequest(
        `${GRAPH_API}/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ expirationDateTime: microsoftExpiration() }),
        },
        credential,
      );
      credential = result.credential;
      return {
        mode: "MICROSOFT_GRAPH_WEBHOOK",
        subscription_id: subscriptionId,
        expiration: text(result.payload?.expirationDateTime) || null,
        resource: text(result.payload?.resource) || "me/mailFolders('inbox')/messages",
        created: false,
      };
    } catch (error) {
      if (![400, 404, 410].includes(Number(error?.status))) throw error;
    }
  }
  return createMicrosoftSubscription(input, credential);
}

export async function ensureGoogleEmailSubscription(input = {}) {
  return googleRequest(input);
}

export async function ensureMicrosoftEmailSubscription(input = {}) {
  return microsoftRequest(input);
}
