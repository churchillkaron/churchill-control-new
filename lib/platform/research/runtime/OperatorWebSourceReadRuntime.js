import crypto from "node:crypto";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export const OPERATOR_WEB_SOURCE_READ_CONTRACT =
  "AVANTIQO_GOVERNED_WEB_SOURCE_READ_V1";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_TEXT_CHARS = 24000;
const MAX_TEXT_CHARS = 60000;
const REQUEST_TIMEOUT_MS = 12000;
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
];
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function text(value) {
  return String(value ?? "").trim();
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function ipv4Number(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (
    ((parts[0] << 24) >>> 0) +
    (parts[1] << 16) +
    (parts[2] << 8) +
    parts[3]
  ) >>> 0;
}

function ipv4InCidr(address, base, prefix) {
  const value = ipv4Number(address);
  const network = ipv4Number(base);
  if (value === null || network === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function publicIpv4(address) {
  const blocked = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !blocked.some(([base, prefix]) => ipv4InCidr(address, base, prefix));
}

function publicIpv6(address) {
  const normalized = address.toLowerCase().split("%")[0];
  if (!normalized || normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return net.isIP(mapped) === 4 && publicIpv4(mapped);
  }
  if (!/^[23][0-9a-f]{3}:/i.test(normalized)) return false;
  if (normalized.startsWith("2001:db8:")) return false;
  return true;
}

function publicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return publicIpv4(address);
  if (family === 6) return publicIpv6(address);
  return false;
}

function normalizedUrl(value) {
  let parsed;
  try {
    parsed = new URL(text(value));
  } catch {
    throw new Error("WEB_SOURCE_READ_URL_INVALID");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("WEB_SOURCE_READ_PROTOCOL_BLOCKED");
  }
  if (parsed.username || parsed.password) {
    throw new Error("WEB_SOURCE_READ_URL_CREDENTIALS_BLOCKED");
  }
  const expectedPort = parsed.protocol === "https:" ? "443" : "80";
  if (parsed.port && parsed.port !== expectedPort) {
    throw new Error("WEB_SOURCE_READ_NONSTANDARD_PORT_BLOCKED");
  }
  parsed.hash = "";
  return parsed;
}

function requestHostname(url) {
  return text(url?.hostname).replace(/^\[|\]$/g, "");
}

function hostnameAllowed(hostname) {
  const host = text(hostname).toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host)) return false;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  return true;
}

async function resolvePinnedAddress(url) {
  const hostname = requestHostname(url).toLowerCase();
  if (!hostnameAllowed(hostname)) {
    throw new Error("WEB_SOURCE_READ_HOST_BLOCKED");
  }

  const directFamily = net.isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily }]
    : await dns.lookup(hostname, { all: true, order: "verbatim" });

  if (!addresses.length) throw new Error("WEB_SOURCE_READ_DNS_REQUIRED");
  if (addresses.some((entry) => !publicAddress(entry.address))) {
    throw new Error("WEB_SOURCE_READ_PRIVATE_ADDRESS_BLOCKED");
  }

  return addresses[0];
}

function contentTypeAllowed(value) {
  const mime = text(value).toLowerCase().split(";")[0];
  return (
    mime.startsWith("text/") ||
    [
      "application/json",
      "application/ld+json",
      "application/xml",
      "application/xhtml+xml",
      "application/rss+xml",
      "application/atom+xml",
    ].includes(mime)
  );
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, number) => {
      const code = Number(number);
      return Number.isInteger(code) && code >= 32 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    });
}

function htmlTitle(value) {
  const match = String(value || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match
    ? decodeEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
    : null;
}

function readableText(value, contentType) {
  const source = String(value || "");
  if (!text(contentType).toLowerCase().includes("html")) {
    return source.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  }
  return decodeEntities(
    source
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function requestOnce(url, pinned) {
  const requestImpl = url.protocol === "https:" ? https.request : http.request;
  const port = url.protocol === "https:" ? 443 : 80;
  const hostname = requestHostname(url);

  return new Promise((resolve, reject) => {
    const request = requestImpl({
      protocol: url.protocol,
      hostname,
      port,
      path: `${url.pathname || "/"}${url.search || ""}`,
      method: "GET",
      servername: url.protocol === "https:" ? hostname : undefined,
      agent: false,
      lookup(_hostname, options, callback) {
        if (options?.all === true) {
          callback(null, [{ address: pinned.address, family: pinned.family }]);
          return;
        }
        callback(null, pinned.address, pinned.family);
      },
      headers: {
        Accept: "text/html, text/plain, application/json, application/xml;q=0.9, */*;q=0.1",
        "Accept-Encoding": "identity",
        "User-Agent": "AvantiqoResearch/1.0 (+public-evidence-reader)",
      },
      maxHeaderSize: 16 * 1024,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) {
          request.destroy(new Error("WEB_SOURCE_READ_BODY_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        status: Number(response.statusCode || 0),
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

async function fetchPublicSource(initialUrl) {
  let current = normalizedUrl(initialUrl);
  const redirects = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const pinned = await resolvePinnedAddress(current);
    const response = await requestOnce(current, pinned);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = text(response.headers.location);
      if (!location) throw new Error("WEB_SOURCE_READ_REDIRECT_LOCATION_REQUIRED");
      if (hop >= MAX_REDIRECTS) throw new Error("WEB_SOURCE_READ_REDIRECT_LIMIT_EXCEEDED");
      const next = normalizedUrl(new URL(location, current).toString());
      redirects.push({ from: current.toString(), to: next.toString() });
      current = next;
      continue;
    }
    return { response, finalUrl: current, redirects, pinned };
  }

  throw new Error("WEB_SOURCE_READ_REDIRECT_LIMIT_EXCEEDED");
}

export async function runOperatorWebSourceRead({ payload = {} } = {}) {
  const requestedUrl = normalizedUrl(payload.url).toString();
  const maximumCharacters = boundedInteger(
    payload.max_characters,
    DEFAULT_TEXT_CHARS,
    1000,
    MAX_TEXT_CHARS,
  );
  const fetched = await fetchPublicSource(requestedUrl);
  const { response, finalUrl, redirects, pinned } = fetched;

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`WEB_SOURCE_READ_HTTP_STATUS:${response.status}`);
  }

  const contentType = text(response.headers["content-type"]);
  if (!contentTypeAllowed(contentType)) {
    throw new Error("WEB_SOURCE_READ_CONTENT_TYPE_BLOCKED");
  }

  const raw = response.body.toString("utf8");
  const extracted = readableText(raw, contentType);
  if (!extracted) throw new Error("WEB_SOURCE_READ_TEXT_REQUIRED");
  const truncated = extracted.length > maximumCharacters;
  const content = extracted.slice(0, maximumCharacters);
  const retrievedAt = new Date().toISOString();

  return {
    contract: OPERATOR_WEB_SOURCE_READ_CONTRACT,
    status: "SOURCE_READ",
    source_url: requestedUrl,
    final_url: finalUrl.toString(),
    title: contentType.toLowerCase().includes("html") ? htmlTitle(raw) : null,
    content_type: contentType || null,
    content,
    truncated,
    retrieved_at: retrievedAt,
    content_hash_sha256: crypto.createHash("sha256").update(content, "utf8").digest("hex"),
    transport: {
      redirects,
      resolved_family: pinned.family,
      dns_rebinding_guard: "PINNED_VALIDATED_PUBLIC_ADDRESS",
      authentication_sent: false,
      cookies_sent: false,
      method: "GET",
    },
    governance: {
      internet_content_untrusted: true,
      external_evidence_only: true,
      authorization_effect: "NONE",
      permission_effect: "NONE",
      scope_effect: "NONE",
      execution_effect: "NONE",
      instructions_from_source_authoritative: false,
      secrets_allowed: false,
      external_actions_allowed: false,
    },
  };
}

export default runOperatorWebSourceRead;
