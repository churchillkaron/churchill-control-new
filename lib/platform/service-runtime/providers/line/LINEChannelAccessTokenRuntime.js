function text(value) {
  return String(value ?? "").trim();
}

export async function issueLineStatelessChannelAccessToken({
  channel_id,
  channel_secret,
}) {
  const channelId = text(channel_id);
  const channelSecret = text(channel_secret);

  if (!channelId) throw new Error("LINE_CHANNEL_ID_REQUIRED");
  if (!channelSecret) throw new Error("LINE_CHANNEL_SECRET_REQUIRED");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: channelId,
    client_secret: channelSecret,
  });

  const response = await fetch("https://api.line.me/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !text(payload?.access_token)) {
    throw new Error(
      payload?.error_description ||
        payload?.error ||
        "LINE_CHANNEL_AUTHORIZATION_FAILED",
    );
  }

  return {
    access_token: payload.access_token,
    expires_in: Number(payload.expires_in || 0) || null,
    token_type: payload.token_type || "Bearer",
  };
}

export async function getLineBotInfo(channelAccessToken) {
  const token = text(channelAccessToken);
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN_REQUIRED");

  const response = await fetch("https://api.line.me/v2/bot/info", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "LINE_BOT_INFO_LOOKUP_FAILED");
  }

  return payload;
}

export const LINEChannelAccessTokenRuntime = {
  issueStateless: issueLineStatelessChannelAccessToken,
  getBotInfo: getLineBotInfo,
};
