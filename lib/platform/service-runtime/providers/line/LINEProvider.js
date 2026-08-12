import "./LINECredentialRegistration.js";

export const LINEProvider = {
  id: "line",

  async execute({
    capability,
    channel_access_token,
    user_id,
    message,
    retry_key = null,
  } = {}) {
    if (!channel_access_token) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN_REQUIRED");
    }

    switch (capability) {
      case "communication.line.send":
        return sendMessage({
          channel_access_token,
          user_id,
          message,
          retry_key,
        });
      default:
        throw new Error(`LINE capability not supported: ${capability}`);
    }
  },
};

async function sendMessage({ channel_access_token, user_id, message, retry_key }) {
  const headers = {
    Authorization: `Bearer ${channel_access_token}`,
    "Content-Type": "application/json",
  };
  if (retry_key) headers["X-Line-Retry-Key"] = retry_key;

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers,
    body: JSON.stringify({
      to: user_id,
      messages: [{ type: "text", text: message }],
    }),
  });

  const raw = await response.text();
  const result = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(result?.message || "LINE send failed");
  }

  return {
    success: true,
    provider: "line",
    output: result,
  };
}
