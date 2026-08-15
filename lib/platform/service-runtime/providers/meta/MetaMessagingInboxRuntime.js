function graphVersion() {
  const configured = String(
    process.env.META_GRAPH_API_VERSION || process.env.META_GRAPH_VERSION || "v24.0"
  ).trim();
  return configured.startsWith("v") ? configured : `v${configured}`;
}

function text(value) {
  return String(value ?? "").trim();
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), minimum), maximum);
}

async function graphJson(url, accessToken) {
  if (!accessToken) throw new Error("Meta messaging access token is required");

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {
    const message =
      payload?.error?.error_user_msg ||
      payload?.error?.message ||
      `Meta messaging inbox request failed (${response.status})`;
    const error = new Error(message);
    error.code = payload?.error?.code || response.status;
    error.subcode = payload?.error?.error_subcode || null;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function collectPagedRows({ firstUrl, accessToken, maxRows, maxPages = 10 }) {
  const rows = [];
  let nextUrl = firstUrl;
  let pages = 0;

  while (nextUrl && rows.length < maxRows && pages < maxPages) {
    const payload = await graphJson(nextUrl, accessToken);
    const data = Array.isArray(payload?.data) ? payload.data : [];
    rows.push(...data.slice(0, Math.max(0, maxRows - rows.length)));
    nextUrl = text(payload?.paging?.next) || null;
    pages += 1;
  }

  return rows;
}

async function conversationMessages({
  conversationId,
  accessToken,
  maxMessages,
}) {
  const firstUrl = new URL(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(conversationId)}/messages`
  );
  firstUrl.searchParams.set("fields", "id,created_time,from,to,message,attachments");
  firstUrl.searchParams.set("limit", String(Math.min(maxMessages, 100)));

  return collectPagedRows({
    firstUrl: firstUrl.toString(),
    accessToken,
    maxRows: maxMessages,
    maxPages: 10,
  });
}

export async function readMetaMessagingInbox({
  access_token,
  account_id,
  platform,
  provider,
  conversation_limit = 100,
  message_limit = 200,
}) {
  const accountId = text(account_id);
  const normalizedPlatform = text(platform).toLowerCase();
  const normalizedProvider = text(provider).toLowerCase();

  if (!accountId) throw new Error("Meta messaging account id is required");
  if (!new Set(["messenger", "instagram"]).has(normalizedPlatform)) {
    throw new Error("Meta messaging platform is invalid");
  }

  const maxConversations = boundedInteger(conversation_limit, 100, 1, 250);
  const maxMessages = boundedInteger(message_limit, 200, 1, 500);
  const firstUrl = new URL(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(accountId)}/conversations`
  );
  firstUrl.searchParams.set("platform", normalizedPlatform);
  firstUrl.searchParams.set("fields", "id,updated_time,participants");
  firstUrl.searchParams.set("limit", String(Math.min(maxConversations, 100)));

  const conversations = await collectPagedRows({
    firstUrl: firstUrl.toString(),
    accessToken: access_token,
    maxRows: maxConversations,
    maxPages: 10,
  });

  const hydrated = [];
  for (const conversation of conversations) {
    const conversationId = text(conversation?.id);
    if (!conversationId) continue;

    const messages = await conversationMessages({
      conversationId,
      accessToken: access_token,
      maxMessages,
    });

    hydrated.push({
      id: conversationId,
      updated_time: conversation?.updated_time || null,
      participants: conversation?.participants || null,
      messages,
    });
  }

  return {
    success: true,
    provider: normalizedProvider,
    platform: normalizedPlatform,
    account_id: accountId,
    conversation_count: hydrated.length,
    conversations: hydrated,
  };
}
