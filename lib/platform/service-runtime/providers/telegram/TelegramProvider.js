import "./TelegramCredentialRegistration.js";

function text(value) { return String(value ?? "").trim(); }

async function telegramRequest(botToken, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok || result?.ok !== true) {
    throw new Error(result?.description || `Telegram ${method} failed`);
  }
  return result.result;
}

export const TelegramProvider = {
  id:"telegram",
  async execute({ capability, bot_token, recipient, message } = {}) {
    if (!bot_token) throw new Error("TELEGRAM_BOT_TOKEN_REQUIRED");
    if (capability !== "communication.telegram.send") {
      throw new Error(`Telegram capability not supported: ${capability}`);
    }
    const chatId = text(recipient);
    const body = text(message);
    if (!chatId) throw new Error("TELEGRAM_CHAT_ID_REQUIRED");
    if (!body) throw new Error("TELEGRAM_MESSAGE_REQUIRED");
    const sent = await telegramRequest(bot_token,"sendMessage",{
      chat_id:chatId,
      text:body,
      disable_web_page_preview:false,
    });
    return {
      success:true,
      provider:"telegram",
      output:{ message_id:String(sent?.message_id || "") || null, chat_id:String(sent?.chat?.id || chatId) },
    };
  },
};
