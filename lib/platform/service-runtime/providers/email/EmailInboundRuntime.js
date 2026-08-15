import tls from "node:tls";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_API = "https://graph.microsoft.com/v1.0";
const TIMEOUT_MS = 15000;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function iso(value) {
  if (!value) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function base64UrlDecode(value) {
  const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) return "";
  const padding = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function emailIdentity(value) {
  const raw = text(value);
  const bracket = raw.match(/^(.*)<([^<>]+@[^<>]+)>\s*$/);
  if (bracket) {
    return {
      name: text(bracket[1]).replace(/^"|"$/g, "") || null,
      address: text(bracket[2]).toLowerCase(),
    };
  }
  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || raw;
  return { name: raw === email ? null : raw, address: text(email).toLowerCase() };
}

function gmailHeaders(payload) {
  return Object.fromEntries(
    (Array.isArray(payload?.headers) ? payload.headers : [])
      .map((row) => [text(row?.name).toLowerCase(), text(row?.value)])
      .filter(([name]) => name),
  );
}

function gmailParts(part, found = { plain: [], html: [], attachments: [] }) {
  if (!part || typeof part !== "object") return found;
  const mimeType = text(part.mimeType).toLowerCase();
  const filename = text(part.filename);
  const data = text(part.body?.data);
  const attachmentId = text(part.body?.attachmentId);
  const size = Number(part.body?.size);

  if (filename || attachmentId) {
    found.attachments.push({
      file_name: filename || null,
      mime_type: mimeType || null,
      size_bytes: Number.isFinite(size) ? size : null,
      provider_attachment_id: attachmentId || null,
    });
  } else if (data && mimeType === "text/plain") {
    found.plain.push(base64UrlDecode(data));
  } else if (data && mimeType === "text/html") {
    found.html.push(base64UrlDecode(data));
  }

  for (const child of Array.isArray(part.parts) ? part.parts : []) {
    gmailParts(child, found);
  }
  return found;
}

function normalizeGmailMessage(message, mailbox) {
  const headers = gmailHeaders(message?.payload);
  const from = emailIdentity(headers.from);
  const parts = gmailParts(message?.payload);
  const body = text(parts.plain.join("\n\n")) || stripHtml(parts.html.join("\n\n"));
  const providerMessageId = text(message?.id);
  if (!providerMessageId || !from.address) return null;

  return {
    external_message_id: providerMessageId,
    external_thread_id: text(message?.threadId) || null,
    participant_id: from.address,
    participant_name: from.name,
    participant_address: from.address,
    recipient_address: text(mailbox).toLowerCase() || emailIdentity(headers.to).address || null,
    subject: headers.subject || null,
    body: body || text(message?.snippet) || null,
    received_at: iso(message?.internalDate) || new Date().toISOString(),
    metadata: {
      source: "GMAIL_API",
      provider_message_id: providerMessageId,
      provider_thread_id: text(message?.threadId) || null,
      internet_message_id: headers["message-id"] || null,
      labels: Array.isArray(message?.labelIds) ? message.labelIds : [],
      snippet: text(message?.snippet) || null,
      attachments: parts.attachments,
    },
  };
}

async function googleRefresh(credential) {
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

async function gmailJson(url, credential) {
  let current = credential;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${text(current?.access_token)}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return { payload, credential: current };
    if (response.status === 401 && attempt === 0 && text(current?.refresh_token)) {
      current = await googleRefresh(current);
      continue;
    }
    const error = new Error(payload?.error?.message || `GMAIL_REQUEST_FAILED:${response.status}`);
    error.status = response.status;
    throw error;
  }
  throw new Error("GMAIL_REQUEST_FAILED");
}

async function gmailMessage(id, credential, mailbox) {
  const url = `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`;
  const result = await gmailJson(url, credential);
  return {
    message: normalizeGmailMessage(result.payload, mailbox),
    credential: result.credential,
  };
}

async function gmailFullSync(input) {
  let credential = input;
  const listUrl = new URL(`${GMAIL_API}/messages`);
  listUrl.searchParams.set("labelIds", "INBOX");
  listUrl.searchParams.set("maxResults", "50");
  const listed = await gmailJson(listUrl, credential);
  credential = listed.credential;

  const messages = [];
  for (const row of Array.isArray(listed.payload?.messages) ? listed.payload.messages : []) {
    const fetched = await gmailMessage(row.id, credential, input.email);
    credential = fetched.credential;
    if (fetched.message) messages.push(fetched.message);
  }

  const profile = await gmailJson(`${GMAIL_API}/profile`, credential);
  return {
    messages,
    cursor: {
      history_id: text(profile.payload?.historyId) || null,
      initialized_at: new Date().toISOString(),
    },
    reset: true,
  };
}

export async function syncGoogleInbox(input = {}) {
  const cursor = object(input.cursor);
  if (!text(cursor.history_id)) return gmailFullSync(input);

  let credential = input;
  let pageToken = null;
  let finalHistoryId = text(cursor.history_id);
  const ids = new Set();

  try {
    for (let page = 0; page < 10; page += 1) {
      const url = new URL(`${GMAIL_API}/history`);
      url.searchParams.set("startHistoryId", text(cursor.history_id));
      url.searchParams.set("labelId", "INBOX");
      url.searchParams.append("historyTypes", "messageAdded");
      url.searchParams.set("maxResults", "500");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const result = await gmailJson(url, credential);
      credential = result.credential;
      for (const history of Array.isArray(result.payload?.history) ? result.payload.history : []) {
        for (const added of Array.isArray(history?.messagesAdded) ? history.messagesAdded : []) {
          if (text(added?.message?.id)) ids.add(text(added.message.id));
        }
      }
      finalHistoryId = text(result.payload?.historyId) || finalHistoryId;
      pageToken = text(result.payload?.nextPageToken) || null;
      if (!pageToken) break;
    }
  } catch (error) {
    if (Number(error?.status) === 404) return gmailFullSync(input);
    throw error;
  }

  const messages = [];
  for (const id of [...ids].slice(0, 500)) {
    const fetched = await gmailMessage(id, credential, input.email);
    credential = fetched.credential;
    if (fetched.message && fetched.message.metadata.labels.includes("INBOX")) {
      messages.push(fetched.message);
    }
  }

  return {
    messages,
    cursor: {
      ...cursor,
      history_id: finalHistoryId,
      last_incremental_sync_at: new Date().toISOString(),
    },
    reset: false,
  };
}

async function microsoftRefresh(credential) {
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

async function graphJson(url, credential) {
  let current = credential;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${text(current?.access_token)}`,
        Prefer: 'IdType="ImmutableId"',
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return { payload, credential: current };
    if (response.status === 401 && attempt === 0 && text(current?.refresh_token)) {
      current = await microsoftRefresh(current);
      continue;
    }
    const error = new Error(payload?.error?.message || `MICROSOFT_GRAPH_FAILED:${response.status}`);
    error.status = response.status;
    throw error;
  }
  throw new Error("MICROSOFT_GRAPH_FAILED");
}

function normalizeMicrosoftMessage(message, mailbox) {
  if (!message || message["@removed"]) return null;
  const fromAddress = text(message?.from?.emailAddress?.address).toLowerCase();
  if (!text(message?.id) || !fromAddress) return null;
  return {
    external_message_id: text(message.id),
    external_thread_id: text(message.conversationId) || null,
    participant_id: fromAddress,
    participant_name: text(message?.from?.emailAddress?.name) || null,
    participant_address: fromAddress,
    recipient_address: text(mailbox).toLowerCase() || null,
    subject: text(message.subject) || null,
    body: text(message.bodyPreview) || null,
    received_at: iso(message.receivedDateTime) || new Date().toISOString(),
    metadata: {
      source: "MICROSOFT_GRAPH",
      provider_message_id: text(message.id),
      provider_thread_id: text(message.conversationId) || null,
      internet_message_id: text(message.internetMessageId) || null,
      has_attachments: message.hasAttachments === true,
      is_read: message.isRead === true,
      web_link: text(message.webLink) || null,
    },
  };
}

export async function syncMicrosoftInbox(input = {}) {
  const cursor = object(input.cursor);
  let url = text(cursor.delta_link);
  if (!url) {
    const initial = new URL(`${GRAPH_API}/me/mailFolders/inbox/messages/delta`);
    initial.searchParams.set(
      "$select",
      "id,conversationId,internetMessageId,subject,from,toRecipients,receivedDateTime,bodyPreview,hasAttachments,isRead,webLink",
    );
    initial.searchParams.set("$top", "50");
    url = initial.toString();
  }

  let credential = input;
  let deltaLink = null;
  const messages = [];

  for (let page = 0; page < 20 && url; page += 1) {
    const result = await graphJson(url, credential);
    credential = result.credential;
    for (const row of Array.isArray(result.payload?.value) ? result.payload.value : []) {
      const normalized = normalizeMicrosoftMessage(row, input.email);
      if (normalized) messages.push(normalized);
    }
    const next = text(result.payload?.["@odata.nextLink"]);
    deltaLink = text(result.payload?.["@odata.deltaLink"]) || deltaLink;
    url = next || null;
  }

  if (!deltaLink && text(cursor.delta_link)) deltaLink = text(cursor.delta_link);
  return {
    messages,
    cursor: {
      delta_link: deltaLink,
      last_delta_sync_at: new Date().toISOString(),
    },
    reset: !text(cursor.delta_link),
  };
}

function decodeHeaderWord(value) {
  return String(value || "").replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, charset, mode, encoded) => {
    try {
      if (mode.toUpperCase() === "B") return Buffer.from(encoded, "base64").toString("utf8");
      const bytes = encoded.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      return Buffer.from(bytes, "binary").toString("utf8");
    } catch {
      return encoded;
    }
  });
}

function parseHeaders(raw) {
  const lines = String(raw || "").replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
  const headers = {};
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const name = line.slice(0, index).trim().toLowerCase();
    const value = decodeHeaderWord(line.slice(index + 1).trim());
    if (!headers[name]) headers[name] = value;
  }
  return headers;
}

function quotedPrintable(value) {
  const soft = String(value || "").replace(/=\r?\n/g, "");
  const binary = soft.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return Buffer.from(binary, "binary").toString("utf8");
}

function decodeMimeBody(headers, body) {
  const transfer = text(headers["content-transfer-encoding"]).toLowerCase();
  if (transfer === "base64") {
    try { return Buffer.from(String(body || "").replace(/\s/g, ""), "base64").toString("utf8"); } catch { return ""; }
  }
  if (transfer === "quoted-printable") return quotedPrintable(body);
  return String(body || "");
}

function mimeText(raw, depth = 0) {
  if (depth > 5) return "";
  const source = String(raw || "");
  const split = source.search(/\r?\n\r?\n/);
  const headerText = split >= 0 ? source.slice(0, split) : "";
  const body = split >= 0 ? source.slice(split).replace(/^\r?\n\r?\n/, "") : source;
  const headers = parseHeaders(headerText);
  const contentType = text(headers["content-type"]).toLowerCase();
  const disposition = text(headers["content-disposition"]).toLowerCase();
  if (disposition.includes("attachment")) return "";

  const boundary = headers["content-type"]?.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (contentType.startsWith("multipart/") && boundary) {
    const token = boundary[1] || boundary[2];
    const parts = body.split(`--${token}`).filter((part) => part.trim() && !part.trim().startsWith("--"));
    const plain = parts
      .filter((part) => /content-type:\s*text\/plain/i.test(part))
      .map((part) => mimeText(part, depth + 1))
      .filter(Boolean);
    if (plain.length) return plain.join("\n\n");
    return parts.map((part) => mimeText(part, depth + 1)).filter(Boolean).join("\n\n");
  }

  const decoded = decodeMimeBody(headers, body);
  return contentType.includes("text/html") ? stripHtml(decoded) : text(decoded);
}

function parseRawEmail(raw, uid, uidValidity, mailbox) {
  const source = String(raw || "");
  const split = source.search(/\r?\n\r?\n/);
  const headers = parseHeaders(split >= 0 ? source.slice(0, split) : source);
  const from = emailIdentity(headers.from);
  if (!from.address) return null;
  return {
    external_message_id: `imap:${uidValidity}:${uid}`,
    external_thread_id: null,
    participant_id: from.address,
    participant_name: from.name,
    participant_address: from.address,
    recipient_address: text(mailbox).toLowerCase() || emailIdentity(headers.to).address || null,
    subject: text(headers.subject) || null,
    body: mimeText(source) || null,
    received_at: iso(headers.date) || new Date().toISOString(),
    metadata: {
      source: "IMAP",
      uid,
      uid_validity: uidValidity,
      internet_message_id: text(headers["message-id"]) || null,
      in_reply_to: text(headers["in-reply-to"]) || null,
      references: text(headers.references) || null,
    },
  };
}

function imapQuote(value) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function imapConnection({ host, port }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("IMAP_CONNECTION_TIMEOUT"));
    }, TIMEOUT_MS);
    socket.once("error", reject);
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function createImapSession(socket) {
  let buffer = Buffer.alloc(0);
  let sequence = 0;
  let wake = null;
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    if (wake) {
      const current = wake;
      wake = null;
      current();
    }
  });

  async function waitForBuffer() {
    if (buffer.length) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("IMAP_RESPONSE_TIMEOUT")), TIMEOUT_MS);
      wake = () => { clearTimeout(timer); resolve(); };
    });
  }

  async function greeting() {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await waitForBuffer();
      const index = buffer.indexOf("\r\n");
      if (index >= 0) {
        const line = buffer.subarray(0, index).toString("utf8");
        buffer = buffer.subarray(index + 2);
        if (!/^\*\s+OK/i.test(line)) throw new Error("IMAP_GREETING_REJECTED");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("IMAP_RESPONSE_TIMEOUT");
  }

  async function command(commandText) {
    sequence += 1;
    const tag = `avq${sequence.toString(16).padStart(5, "0")}`;
    socket.write(`${tag} ${commandText}\r\n`);
    const marker = Buffer.from(`\r\n${tag} `);
    const startMarker = Buffer.from(`${tag} `);
    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
      await waitForBuffer();
      let markerIndex = buffer.indexOf(marker);
      let tagStart = markerIndex >= 0 ? markerIndex + 2 : -1;
      if (tagStart < 0 && buffer.indexOf(startMarker) === 0) tagStart = 0;
      if (tagStart >= 0) {
        const lineEnd = buffer.indexOf("\r\n", tagStart);
        if (lineEnd >= 0) {
          const response = buffer.subarray(0, lineEnd + 2);
          buffer = buffer.subarray(lineEnd + 2);
          const tagged = response.subarray(tagStart, lineEnd).toString("utf8");
          if (!new RegExp(`^${tag}\\s+OK`, "i").test(tagged)) {
            throw new Error(`IMAP_COMMAND_FAILED:${tagged}`);
          }
          return response;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("IMAP_RESPONSE_TIMEOUT");
  }

  return { greeting, command };
}

function literalFromFetch(buffer) {
  const source = buffer.toString("latin1");
  const match = /\{(\d+)\}\r\n/.exec(source);
  if (!match) return "";
  const size = Number(match[1]);
  const start = match.index + match[0].length;
  return buffer.subarray(start, start + size).toString("utf8");
}

export async function syncImapInbox(input = {}) {
  const imap = object(input.imap);
  const host = text(imap.host);
  const port = Number(imap.port || 993);
  const username = text(input.username || input.email);
  const password = text(input.password);
  if (!host || !port || !username || !password) throw new Error("IMAP_EMAIL_CREDENTIAL_INCOMPLETE");

  const socket = await imapConnection({ host, port });
  const session = createImapSession(socket);
  try {
    await session.greeting();
    await session.command(`LOGIN ${imapQuote(username)} ${imapQuote(password)}`);
    const selected = await session.command("SELECT INBOX");
    const selectedText = selected.toString("utf8");
    const uidValidity = text(selectedText.match(/\[UIDVALIDITY\s+(\d+)\]/i)?.[1]) || "unknown";
    const cursor = object(input.cursor);
    const sameMailbox = text(cursor.uid_validity) === uidValidity;
    const lastUid = sameMailbox ? Number(cursor.last_uid || 0) : 0;

    const searched = await session.command(lastUid > 0 ? `UID SEARCH UID ${lastUid + 1}:*` : "UID SEARCH ALL");
    const searchLine = searched.toString("utf8").match(/\* SEARCH([^\r\n]*)/i)?.[1] || "";
    let uids = searchLine.trim().split(/\s+/).map(Number).filter((value) => Number.isInteger(value) && value > 0);
    uids.sort((a, b) => a - b);
    if (lastUid === 0) uids = uids.slice(-50);
    else uids = uids.slice(0, 100);

    const messages = [];
    for (const uid of uids) {
      const fetched = await session.command(`UID FETCH ${uid} (UID BODY.PEEK[])`);
      const raw = literalFromFetch(fetched);
      const normalized = parseRawEmail(raw, uid, uidValidity, input.email);
      if (normalized) messages.push(normalized);
    }

    const maxUid = uids.length ? Math.max(...uids) : lastUid;
    await session.command("LOGOUT").catch(() => null);
    return {
      messages,
      cursor: {
        uid_validity: uidValidity,
        last_uid: maxUid,
        last_imap_sync_at: new Date().toISOString(),
      },
      reset: !sameMailbox,
    };
  } finally {
    socket.end();
  }
}
