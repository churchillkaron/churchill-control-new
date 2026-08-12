import net from "node:net";
import tls from "node:tls";

const TIMEOUT_MS = 12000;

function quoted(value) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function connectRaw({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: true })
      : net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection to ${host}:${port} timed out`));
    }, TIMEOUT_MS);
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    const readyEvent = secure ? "secureConnect" : "connect";
    socket.once(readyEvent, () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function wrapTls(socket, host) {
  return new Promise((resolve, reject) => {
    const wrapped = tls.connect({ socket, servername: host, rejectUnauthorized: true });
    const timer = setTimeout(() => {
      wrapped.destroy();
      reject(new Error(`TLS negotiation with ${host} timed out`));
    }, TIMEOUT_MS);
    wrapped.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    wrapped.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(wrapped);
    });
  });
}

function reader(socket) {
  let buffer = "";
  const queue = [];
  const waiters = [];

  function flush(line) {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line);
    else queue.push(line);
  }

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    while (buffer.includes("\r\n")) {
      const index = buffer.indexOf("\r\n");
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      flush(line);
    }
  });

  return {
    async line() {
      if (queue.length) return queue.shift();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((item) => item.resolve === resolve);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("Mail server response timed out"));
        }, TIMEOUT_MS);
        waiters.push({
          resolve(value) {
            clearTimeout(timer);
            resolve(value);
          },
        });
      });
    },
  };
}

async function smtpResponse(lines, expectedCode) {
  while (true) {
    const line = await lines.line();
    if (!line.startsWith(expectedCode)) {
      if (/^[45]\d\d/.test(line)) throw new Error(`SMTP authentication failed: ${line}`);
      continue;
    }
    if (line[3] !== "-") return line;
  }
}

async function verifyImap({ host, port, username, password }) {
  const socket = await connectRaw({ host, port, secure: true });
  const lines = reader(socket);
  try {
    const greeting = await lines.line();
    if (!greeting.toUpperCase().includes("OK")) throw new Error("IMAP server did not accept the connection");
    socket.write(`a1 LOGIN ${quoted(username)} ${quoted(password)}\r\n`);
    while (true) {
      const line = await lines.line();
      if (!line.toLowerCase().startsWith("a1 ")) continue;
      if (!line.toUpperCase().includes(" OK")) throw new Error("Incoming mail username or password was rejected");
      break;
    }
    socket.write("a2 LOGOUT\r\n");
  } finally {
    socket.end();
  }
}

async function verifySmtp({ host, port, security, username, password }) {
  let socket = await connectRaw({ host, port, secure: security === "TLS" });
  let lines = reader(socket);
  try {
    await smtpResponse(lines, "220");
    socket.write("EHLO avantiqo.ai\r\n");
    await smtpResponse(lines, "250");

    if (security === "STARTTLS") {
      socket.write("STARTTLS\r\n");
      await smtpResponse(lines, "220");
      socket.removeAllListeners("data");
      socket = await wrapTls(socket, host);
      lines = reader(socket);
      socket.write("EHLO avantiqo.ai\r\n");
      await smtpResponse(lines, "250");
    }

    socket.write("AUTH LOGIN\r\n");
    await smtpResponse(lines, "334");
    socket.write(`${Buffer.from(username).toString("base64")}\r\n`);
    await smtpResponse(lines, "334");
    socket.write(`${Buffer.from(password).toString("base64")}\r\n`);
    await smtpResponse(lines, "235");
    socket.write("QUIT\r\n");
  } finally {
    socket.end();
  }
}

export async function verifyManualMailbox({
  email,
  username,
  password,
  imapHost,
  imapPort = 993,
  smtpHost,
  smtpPort = 465,
  smtpSecurity = "TLS",
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const login = String(username || normalizedEmail).trim();
  if (!normalizedEmail || !login || !password || !imapHost || !smtpHost) {
    throw new Error("Mailbox settings are incomplete");
  }
  await verifyImap({ host: String(imapHost).trim(), port: Number(imapPort), username: login, password });
  await verifySmtp({
    host: String(smtpHost).trim(),
    port: Number(smtpPort),
    security: String(smtpSecurity || "TLS").trim().toUpperCase(),
    username: login,
    password,
  });
  return { email: normalizedEmail, username: login };
}
