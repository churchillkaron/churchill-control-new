function graphVersion() {
  const configured = String(
    process.env.META_GRAPH_API_VERSION || process.env.META_GRAPH_VERSION || "v24.0"
  ).trim();
  return configured.startsWith("v") ? configured : `v${configured}`;
}

function text(value) {
  return String(value ?? "").trim();
}

function rows(value) {
  return Array.isArray(value?.data) ? value.data : Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), minimum), maximum);
}

function normalizedPlatform(value) {
  const platform = text(value).toLowerCase();
  return platform === "instagram" || platform === "messenger" ? platform : null;
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
  const collected = [];
  let nextUrl = firstUrl;
  let pages = 0;

  while (nextUrl && collected.length < maxRows && pages < maxPages) {
    const payload = await graphJson(nextUrl, accessToken);
    const data = Array.isArray(payload?.data) ? payload.data : [];
    collected.push(...data.slice(0, Math.max(0, maxRows - collected.length)));
    nextUrl = text(payload?.paging?.next) || null;
    pages += 1;
  }

  return collected;
}

async function conversationMessages({ conversationId, accessToken, maxMessages }) {
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

async function hydrateConversations({ conversations, accessToken, maxMessages, concurrency }) {
  const hydrated = [];

  for (let offset = 0; offset < conversations.length; offset += concurrency) {
    const batch = conversations.slice(offset, offset + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (conversation) => {
        const conversationId = text(conversation?.id);
        if (!conversationId) return null;

        const messages = await conversationMessages({
          conversationId,
          accessToken,
          maxMessages,
        });

        return {
          id: conversationId,
          updated_time: conversation?.updated_time || null,
          participants: rows(conversation?.participants),
          messages,
        };
      }),
    );

    hydrated.push(...batchResults.filter(Boolean));
  }

  return hydrated;
}

export async function readMetaMessagingInbox({
  access_token,
  account_id,
  provider = "meta",
  platform = null,
  conversation_limit = 100,
  message_limit = 100,
  hydration_concurrency = 6,
}) {
  const accountId = text(account_id);
  const normalizedProvider = text(provider).toLowerCase() || "meta";
  const requestedPlatform = normalizedPlatform(platform);

  if (!accountId) throw new Error("Meta messaging account id is required");

  const maxConversations = boundedInteger(conversation_limit, 100, 1, 250);
  const maxMessages = boundedInteger(message_limit, 100, 1, 100);
  const concurrency = boundedInteger(hydration_concurrency, 6, 1, 10);
  const firstUrl = new URL(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(accountId)}/conversations`
  );
  firstUrl.searchParams.set("fields", "id,updated_time,participants");
  firstUrl.searchParams.set("limit", String(Math.min(maxConversations, 100)));
  if (requestedPlatform) firstUrl.searchParams.set("platform", requestedPlatform);

  const conversations = await collectPagedRows({
    firstUrl: firstUrl.toString(),
    accessToken: access_token,
    maxRows: maxConversations,
    maxPages: 10,
  });

  const hydrated = await hydrateConversations({
    conversations,
    accessToken: access_token,
    maxMessages,
    concurrency,
  });

  return {
    success: true,
    provider: normalizedProvider,
    platform: requestedPlatform,
    account_id: accountId,
    conversation_count: hydrated.length,
    conversations: hydrated,
  };
}
