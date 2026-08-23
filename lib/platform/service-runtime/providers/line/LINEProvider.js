import crypto from "node:crypto";
import "./LINECredentialRegistration.js";

function normalizedRetryKey(value) {
  const source = String(value || "").trim();
  if (!source) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(source)) {
    return source;
  }
  const seed = crypto.createHash("sha256").update(source).digest("hex").slice(0, 32).split("");
  seed[12] = "4";
  seed[16] = ["8", "9", "a", "b"][parseInt(seed[16], 16) % 4];
  const hex = seed.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

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
  const resolvedRetryKey = normalizedRetryKey(retry_key);
  if (resolvedRetryKey) headers["X-Line-Retry-Key"] = resolvedRetryKey;

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
