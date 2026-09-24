import crypto from "node:crypto";

function text(value) { return String(value ?? "").trim(); }

export function telegramWebhookSecret({ botToken, organizationId, connectionId }) {
  const token = text(botToken);
  const org = text(organizationId);
  const connection = text(connectionId);
  if (!token || !org || !connection) throw new Error("TELEGRAM_WEBHOOK_SECRET_CONTEXT_REQUIRED");
  return crypto
    .createHash("sha256")
    .update(`avantiqo:telegram-webhook:${org}:${connection}:${token}`)
    .digest("hex");
}

export async function telegramBotApi({ botToken, method, payload = null }) {
  const token = text(botToken);
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN_REQUIRED");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: payload ? "POST" : "GET",
    ...(payload ? { headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) } : {}),
    cache:"no-store",
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok || result?.ok !== true) {
    throw new Error(result?.description || `Telegram ${method} failed`);
  }
  return result.result;
}

export async function validateTelegramBot(botToken) {
  const bot = await telegramBotApi({ botToken, method:"getMe" });
  if (!bot?.id || bot?.is_bot !== true) throw new Error("TELEGRAM_BOT_IDENTITY_INVALID");
  return {
    id:String(bot.id),
    username:text(bot.username) || null,
    first_name:text(bot.first_name) || null,
    can_join_groups:bot.can_join_groups === true,
    can_read_all_group_messages:bot.can_read_all_group_messages === true,
    supports_inline_queries:bot.supports_inline_queries === true,
  };
}

export async function configureTelegramWebhook({ botToken, organizationId, connectionId, publicOrigin }) {
  const origin = new URL(text(publicOrigin)).origin;
  if (!origin.startsWith("https://")) throw new Error("TELEGRAM_PUBLIC_HTTPS_ORIGIN_REQUIRED");
  const secretToken = telegramWebhookSecret({ botToken, organizationId, connectionId });
  const webhookUrl = `${origin}/api/commercial/communications/webhooks/telegram/${encodeURIComponent(connectionId)}`;
  await telegramBotApi({
    botToken,
    method:"setWebhook",
    payload:{
      url:webhookUrl,
      secret_token:secretToken,
      allowed_updates:["message"],
      drop_pending_updates:false,
    },
  });
  return { webhookUrl };
}

export async function removeTelegramWebhook({ botToken }) {
  return telegramBotApi({ botToken, method:"deleteWebhook", payload:{ drop_pending_updates:false } });
}
