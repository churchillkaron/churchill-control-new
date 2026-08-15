import net from "node:net";
import tls from "node:tls";
import "./EmailCredentialRegistration.js";

const TIMEOUT_MS = 15000;

function text(value) {
  return String(value ?? "").trim();
}

function base64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeHeader(value) {
  const normalized = text(value);
  if (!normalized) return "";
  return /^[\x20-\x7E]*$/.test(normalized)
    ? normalized
    : `=?UTF-8?B?${Buffer.from(normalized, "utf8").toString("base64")}?=`;
}

async function materializeAttachments(attachments = []) {
  const rows = [];
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const url = text(attachment?.url);
    if (!url) {
      throw new Error("EMAIL_ATTACHMENT_PUBLIC_URL_REQUIRED");
    }
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`EMAIL_ATTACHMENT_FETCH_FAILED:${response.status}`);
    }
    rows.push({
      name: text(attachment?.name) || "attachment",
      mime_type:
        text(attachment?.mime_type) ||
        text(response.headers.get("content-type")) ||
        "application/octet-stream",
      bytes: Buffer.from(await response.arrayBuffer()),
    });
  }
  return rows;
}

async function mimeMessage({ from, to, subject, body, attachments = [] }) {
  const files = await materializeAttachments(attachments);
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject || "")}`,
    "MIME-Version: 1.0",
  ];

  if (!files.length) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      body || "",
    ].join("\r\n");
  }

  const boundary = `avantiqo_${crypto.randomUUID().replace(/-/g, "")}`;
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body || "",
  ];

  for (const file of files) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${file.mime_type}; name="${file.name.replace(/"/g, "")}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${file.name.replace(/"/g, "")}"`,
      "",
      file.bytes.toString("base64").replace(/(.{76})/g, "$1\r\n"),
    );
  }
  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

async function refreshGoogleCredential(credential) {
  if (!credential?.refresh_token) return credential;
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
  if (!response.ok || !payload.access_token) {
    throw new Error(payload?.error_description || "GOOGLE_EMAIL_TOKEN_REFRESH_FAILED");
  }
  return { ...credential, ...payload };
}

async function refreshMicrosoftCredential(credential) {
  if (!credential?.refresh_token) return credential;
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
  if (!response.ok || !payload.access_token) {
    throw new Error(payload?.error_description || "MICROSOFT_EMAIL_TOKEN_REFRESH_FAILED");
  }
  return { ...credential, ...payload };
}

async function sendGoogle(input) {
  const credential = await refreshGoogleCredential(input);
  const accessToken = text(credential.access_token);
  const from = text(credential.email);
  if (!accessToken || !from) throw new Error("GOOGLE_EMAIL_CREDENTIAL_INCOMPLETE");
  const raw = await mimeMessage({
    from,
    to: text(input.recipient),
    subject: input.subject,
    body: input.message,
    attachments: input.attachments,
  });
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(raw) }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "GOOGLE_EMAIL_SEND_FAILED");
  return { success: true, provider: "email_google", output: payload };
}

async function sendMicrosoft(input) {
  const credential = await refreshMicrosoftCredential(input);
  const accessToken = text(credential.access_token);
  if (!accessToken) throw new Error("MICROSOFT_EMAIL_CREDENTIAL_INCOMPLETE");
  const files = await materializeAttachments(input.attachments);
  const message = {
    subject: input.subject || "",
    body: {
      contentType: "Text",
      content: input.message || "",
    },
    toRecipients: [
      { emailAddress: { address: text(input.recipient) } },
    ],
    ...(files.length
      ? {
          attachments: files.map((file) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: file.name,
            contentType: file.mime_type,
            contentBytes: file.bytes.toString("base64"),
          })),
        }
      : {}),
  };
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || "MICROSOFT_EMAIL_SEND_FAILED");
  }
  return { success: true, provider: "email_microsoft", output: { accepted: true } };
}

function socketReader(socket) {
  let buffer = "";
  const lines = [];
  const waiters = [];
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    while (buffer.includes("\r\n")) {
      const index = buffer.indexOf("\r\n");
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else lines.push(line);
    }
  });
  return {
    line() {
      if (lines.length) return Promise.resolve(lines.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("SMTP_RESPONSE_TIMEOUT")), TIMEOUT_MS);
        waiters.push((line) => {
          clearTimeout(timer);
          resolve(line);
        });
      });
    },
  };
}

async function smtpResponse(reader, expected) {
  while (true) {
    const line = await reader.line();
    if (/^[45]\d\d/.test(line)) throw new Error(`SMTP_REJECTED:${line}`);
    if (line.startsWith(expected) && line[3] !== "-") return line;
  }
}

function connectSocket({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: true })
      : net.connect({ host, port });
    const event = secure ? "secureConnect" : "connect";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("SMTP_CONNECTION_TIMEOUT"));
    }, TIMEOUT_MS);
    socket.once("error", reject);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function upgradeTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host, rejectUnauthorized: true });
    secure.once("error", reject);
    secure.once("secureConnect", () => resolve(secure));
  });
}

async function sendSmtp(input) {
  const smtp = input.smtp || {};
  const host = text(smtp.host);
  const port = Number(smtp.port || 465);
  const security = text(smtp.security).toUpperCase() || "TLS";
  const username = text(input.username || input.email);
  const password = text(input.password);
  const from = text(input.email || username);
  const recipient = text(input.recipient);
  if (!host || !username || !password || !from || !recipient) {
    throw new Error("SMTP_EMAIL_CREDENTIAL_INCOMPLETE");
  }

  let socket = await connectSocket({ host, port, secure: security === "TLS" });
  let reader = socketReader(socket);
  try {
    await smtpResponse(reader, "220");
    socket.write("EHLO avantiqo.ai\r\n");
    await smtpResponse(reader, "250");
    if (security === "STARTTLS") {
      socket.write("STARTTLS\r\n");
      await smtpResponse(reader, "220");
      socket.removeAllListeners("data");
      socket = await upgradeTls(socket, host);
      reader = socketReader(socket);
      socket.write("EHLO avantiqo.ai\r\n");
      await smtpResponse(reader, "250");
    }
    socket.write("AUTH LOGIN\r\n");
    await smtpResponse(reader, "334");
    socket.write(`${Buffer.from(username).toString("base64")}\r\n`);
    await smtpResponse(reader, "334");
    socket.write(`${Buffer.from(password).toString("base64")}\r\n`);
    await smtpResponse(reader, "235");
    socket.write(`MAIL FROM:<${from}>\r\n`);
    await smtpResponse(reader, "250");
    socket.write(`RCPT TO:<${recipient}>\r\n`);
    await smtpResponse(reader, "250");
    socket.write("DATA\r\n");
    await smtpResponse(reader, "354");
    const mime = await mimeMessage({
      from,
      to: recipient,
      subject: input.subject,
      body: input.message,
      attachments: input.attachments,
    });
    socket.write(`${mime.replace(/^\./gm, "..")}\r\n.\r\n`);
    const accepted = await smtpResponse(reader, "250");
    socket.write("QUIT\r\n");
    return {
      success: true,
      provider: "email_imap",
      output: { accepted: true, response: accepted },
    };
  } finally {
    socket.end();
  }
}

function provider(id, executeSend) {
  return {
    id,
    async execute(input = {}) {
      if (input.capability !== "communication.email.send") {
        throw new Error(`${id} capability not supported: ${input.capability}`);
      }
      if (!text(input.recipient)) throw new Error("EMAIL_RECIPIENT_REQUIRED");
      if (!text(input.message) && !(input.attachments || []).length) {
        throw new Error("EMAIL_BODY_OR_ATTACHMENT_REQUIRED");
      }
      return executeSend(input);
    },
  };
}

export const GoogleEmailProvider = provider("email_google", sendGoogle);
export const MicrosoftEmailProvider = provider("email_microsoft", sendMicrosoft);
export const ImapEmailProvider = provider("email_imap", sendSmtp);
