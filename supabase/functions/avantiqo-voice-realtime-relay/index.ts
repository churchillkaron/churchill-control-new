import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const RELAY_CONTRACT = "AVANTIQO_VOICE_REALTIME_RELAY_V1";
const ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const REALTIME_CONTRACT = "AVANTIQO_VOICE_STT_REALTIME_V1";
const CAPABILITY = "ai.speech.to.text.realtime";
const FOUNDATION_MODEL = "openai/whisper-large-v3-turbo";
const CLIENT_PROTOCOL = "avantiqo-voice-realtime-v1";
const JWT_PROTOCOL_PREFIX = "jwt.";
const TARGET_SAMPLE_RATE = 16000;
const SESSION_TTL_SECONDS = 60;
const UPSTREAM_OPEN_TIMEOUT_MS = 60_000;
const SESSION_HARD_TIMEOUT_MS = 90_000;
const MAX_CLIENT_EVENT_CHARS = 100_000;
const MAX_UPSTREAM_EVENT_CHARS = 64_000;
const MAX_TOTAL_AUDIO_BASE64_CHARS = 1_400_000;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function enabled(value: unknown): boolean {
  return text(value).toLowerCase() === "true";
}

function activeRecord(record: Record<string, unknown>): boolean {
  if (record.archived === true) return false;
  if (
    record.active === false ||
    record.is_active === false ||
    record.enabled === false
  ) {
    return false;
  }
  const status = text(record.status).toUpperCase();
  return ![
    "INACTIVE",
    "DISABLED",
    "SUSPENDED",
    "TERMINATED",
    "ARCHIVED",
    "REVOKED",
  ].includes(status);
}

function protocols(request: Request): string[] {
  return text(request.headers.get("sec-websocket-protocol"))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function userJwt(request: Request): string | null {
  const candidate = protocols(request).find((value) =>
    value.startsWith(JWT_PROTOCOL_PREFIX)
  );
  return candidate ? text(candidate.slice(JWT_PROTOCOL_PREFIX.length)) : null;
}

function supabaseSecretKey(): string {
  const raw = text(Deno.env.get("SUPABASE_SECRET_KEYS"));
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const key = text(parsed?.default);
      if (key) return key;
    } catch {
      throw new Error("AVANTIQO_VOICE_REALTIME_SUPABASE_SECRET_KEYS_INVALID");
    }
  }

  const localKey = text(Deno.env.get("SUPABASE_SECRET_KEY"));
  if (localKey) return localKey;

  const legacyKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (legacyKey) return legacyKey;

  throw new Error("AVANTIQO_VOICE_REALTIME_SUPABASE_SECRET_KEY_REQUIRED");
}

function upstreamUrl(): string {
  const raw = text(Deno.env.get("AVANTIQO_VOICE_REALTIME_RUNPOD_WS_URL"));
  if (!raw) {
    throw new Error("AVANTIQO_VOICE_REALTIME_RUNPOD_WS_URL_REQUIRED");
  }

  const url = new URL(raw);
  const validHost =
    url.protocol === "wss:" &&
    url.hostname.endsWith(".api.runpod.ai") &&
    url.pathname === "/v1/realtime/transcribe" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash;

  if (!validHost) {
    throw new Error("AVANTIQO_VOICE_REALTIME_RUNPOD_WS_URL_INVALID");
  }
  return url.toString();
}

function runpodApiKey(): string {
  const key = text(Deno.env.get("AVANTIQO_VOICE_REALTIME_RUNPOD_API_KEY"));
  if (!key) {
    throw new Error("AVANTIQO_VOICE_REALTIME_RUNPOD_API_KEY_REQUIRED");
  }
  return key;
}

function relaySecret(): string {
  const secret = text(Deno.env.get("AVANTIQO_VOICE_REALTIME_RELAY_SECRET"));
  if (secret.length < 32) {
    throw new Error("AVANTIQO_VOICE_REALTIME_RELAY_SECRET_REQUIRED");
  }
  return secret;
}

function assertReleaseGate(): void {
  if (!enabled(Deno.env.get("AVANTIQO_VOICE_REALTIME_RELAY_ENABLED"))) {
    throw new Error("AVANTIQO_VOICE_REALTIME_RELAY_DISABLED");
  }
  if (!enabled(Deno.env.get("AVANTIQO_VOICE_REALTIME_ENGINE_CERTIFIED"))) {
    throw new Error("AVANTIQO_VOICE_REALTIME_ENGINE_NOT_CERTIFIED");
  }
  if (text(Deno.env.get("AVANTIQO_VOICE_REALTIME_RELEASE_APPROVED")) !== "YES") {
    throw new Error("AVANTIQO_VOICE_REALTIME_RELEASE_NOT_APPROVED");
  }
}

function languageCode(value: unknown): string | null {
  const normalized = text(value).toLowerCase().replaceAll("_", "-");
  if (!normalized) return null;
  const base = normalized.split("-")[0];
  return /^[a-z]{2,3}$/.test(base) ? base : null;
}

function organizationIdFromRequest(request: Request): string {
  const organizationId = text(new URL(request.url).searchParams.get("organizationId"));
  if (!organizationId || organizationId.length > 128) {
    throw new Error("AVANTIQO_VOICE_REALTIME_ORGANIZATION_REQUIRED");
  }
  return organizationId;
}

async function requireOrganizationMembership(
  request: Request,
  organizationId: string,
): Promise<{ userId: string; staffAccountId: string }> {
  const token = userJwt(request);
  if (!token || token.length > 8192) {
    throw new Error("AVANTIQO_VOICE_REALTIME_AUTH_REQUIRED");
  }

  const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
  if (!supabaseUrl) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SUPABASE_URL_REQUIRED");
  }

  const admin = createClient(supabaseUrl, supabaseSecretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const userId = text(authData?.user?.id);
  if (authError || !userId) {
    throw new Error("AVANTIQO_VOICE_REALTIME_AUTH_INVALID");
  }

  const { data: staffRows, error: staffError } = await admin
    .from("staff_accounts")
    .select("*")
    .eq("auth_user_id", userId)
    .limit(1000);

  if (staffError) {
    throw new Error("AVANTIQO_VOICE_REALTIME_STAFF_LOOKUP_FAILED");
  }

  const activeStaff = (staffRows || []).filter((row) => activeRecord(row));
  const direct = activeStaff.find((row) =>
    [
      row.organization_id,
      row.active_organization_id,
      row.organization?.id,
      row.metadata?.organization_id,
      row.metadata?.active_organization_id,
    ].map(text).includes(organizationId)
  );
  if (direct?.id) {
    return { userId, staffAccountId: text(direct.id) };
  }

  const staffIds = activeStaff.map((row) => text(row.id)).filter(Boolean);
  if (!staffIds.length) {
    throw new Error("AVANTIQO_VOICE_REALTIME_ORGANIZATION_ACCESS_DENIED");
  }

  const { data: membershipRows, error: membershipError } = await admin
    .from("organization_users")
    .select("*")
    .eq("organization_id", organizationId)
    .in("staff_account_id", staffIds)
    .limit(1000);

  if (membershipError) {
    throw new Error("AVANTIQO_VOICE_REALTIME_MEMBERSHIP_LOOKUP_FAILED");
  }

  const membership = (membershipRows || []).find((row) => activeRecord(row));
  const staffAccountId = text(membership?.staff_account_id);
  if (!staffAccountId) {
    throw new Error("AVANTIQO_VOICE_REALTIME_ORGANIZATION_ACCESS_DENIED");
  }

  return { userId, staffAccountId };
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signedSessionStart({
  organizationId,
  sessionId,
  language,
}: {
  organizationId: string;
  sessionId: string;
  language: string | null;
}): Promise<Record<string, unknown>> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = `${REALTIME_CONTRACT}|${sessionId}|${organizationId}|${expiresAt}`;
  const signature = await hmacHex(relaySecret(), value);
  return {
    type: "session.start",
    contract: REALTIME_CONTRACT,
    engine_contract: ENGINE_CONTRACT,
    capability: CAPABILITY,
    foundation_model: FOUNDATION_MODEL,
    session_id: sessionId,
    organization_id: organizationId,
    expires_at: expiresAt,
    signature,
    sample_rate: TARGET_SAMPLE_RATE,
    ...(language ? { language } : {}),
  };
}

function safeClientEvent(raw: unknown, totalAudioChars: number): {
  event: Record<string, unknown>;
  totalAudioChars: number;
} {
  if (typeof raw !== "string" || raw.length > MAX_CLIENT_EVENT_CHARS) {
    throw new Error("AVANTIQO_VOICE_REALTIME_CLIENT_EVENT_INVALID");
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new Error("AVANTIQO_VOICE_REALTIME_CLIENT_JSON_INVALID");
  }

  const type = text(event.type);
  if (!["audio.append", "audio.commit", "session.cancel", "session.ping"].includes(type)) {
    throw new Error("AVANTIQO_VOICE_REALTIME_CLIENT_EVENT_FORBIDDEN");
  }

  if (type !== "audio.append") {
    return { event: { type }, totalAudioChars };
  }

  const audio = text(event.audio);
  if (!audio || audio.length > MAX_CLIENT_EVENT_CHARS - 100) {
    throw new Error("AVANTIQO_VOICE_REALTIME_AUDIO_CHUNK_INVALID");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) {
    throw new Error("AVANTIQO_VOICE_REALTIME_AUDIO_BASE64_INVALID");
  }

  const nextTotal = totalAudioChars + audio.length;
  if (nextTotal > MAX_TOTAL_AUDIO_BASE64_CHARS) {
    throw new Error("AVANTIQO_VOICE_REALTIME_AUDIO_LIMIT_EXCEEDED");
  }

  return {
    event: { type, audio },
    totalAudioChars: nextTotal,
  };
}

function responseError(error: unknown, status = 500): Response {
  return Response.json(
    {
      success: false,
      contract: RELAY_CONTRACT,
      error: text(error instanceof Error ? error.message : error) ||
        "AVANTIQO_VOICE_REALTIME_RELAY_FAILED",
      realtime_streaming_certified: false,
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

Deno.serve(async (request) => {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return responseError("AVANTIQO_VOICE_REALTIME_WEBSOCKET_REQUIRED", 426);
  }

  if (!protocols(request).includes(CLIENT_PROTOCOL)) {
    return responseError("AVANTIQO_VOICE_REALTIME_PROTOCOL_REQUIRED", 400);
  }

  try {
    assertReleaseGate();
    const organizationId = organizationIdFromRequest(request);
    const language = languageCode(new URL(request.url).searchParams.get("language"));
    await requireOrganizationMembership(request, organizationId);

    const runpodUrl = upstreamUrl();
    const runpodKey = runpodApiKey();
    const sessionId = crypto.randomUUID();
    const sessionStart = await signedSessionStart({
      organizationId,
      sessionId,
      language,
    });

    const { socket: client, response } = Deno.upgradeWebSocket(request, {
      protocol: CLIENT_PROTOCOL,
      idleTimeout: 60,
    });

    let upstream: WebSocket | null = null;
    let upstreamReady = false;
    let closed = false;
    let totalAudioChars = 0;
    let openTimer: number | null = null;
    let sessionTimer: number | null = null;
    let resolveClosed: (() => void) | null = null;
    const closedPromise = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });

    const finish = (code = 1000, reason = "complete") => {
      if (closed) return;
      closed = true;
      if (openTimer !== null) clearTimeout(openTimer);
      if (sessionTimer !== null) clearTimeout(sessionTimer);
      try {
        if (client.readyState === WebSocket.OPEN) client.close(code, reason);
      } catch {}
      try {
        if (upstream?.readyState === WebSocket.OPEN) upstream.close(code, reason);
      } catch {}
      upstream = null;
      resolveClosed?.();
      resolveClosed = null;
    };

    const sendClient = (payload: Record<string, unknown>) => {
      if (client.readyState !== WebSocket.OPEN) return;
      client.send(JSON.stringify(payload));
    };

    client.addEventListener("open", () => {
      sendClient({
        type: "relay.connecting",
        contract: RELAY_CONTRACT,
        session_id: sessionId,
        realtime_streaming_certified: false,
      });

      // Deno 2 supports custom headers on outbound WebSocket handshakes.
      // Browsers never receive the restricted RunPod key.
      upstream = new WebSocket(runpodUrl, {
        headers: new Headers({
          Authorization: `Bearer ${runpodKey}`,
        }),
      });

      openTimer = setTimeout(() => {
        sendClient({
          type: "relay.error",
          contract: RELAY_CONTRACT,
          code: "AVANTIQO_VOICE_REALTIME_UPSTREAM_OPEN_TIMEOUT",
        });
        finish(1013, "upstream timeout");
      }, UPSTREAM_OPEN_TIMEOUT_MS);

      upstream.addEventListener("open", () => {
        if (closed || !upstream) return;
        if (openTimer !== null) clearTimeout(openTimer);
        openTimer = null;
        upstreamReady = true;
        upstream.send(JSON.stringify(sessionStart));
      });

      upstream.addEventListener("message", (event) => {
        if (closed || typeof event.data !== "string") return;
        if (event.data.length > MAX_UPSTREAM_EVENT_CHARS) {
          sendClient({
            type: "relay.error",
            contract: RELAY_CONTRACT,
            code: "AVANTIQO_VOICE_REALTIME_UPSTREAM_EVENT_TOO_LARGE",
          });
          finish(1009, "upstream event too large");
          return;
        }
        try {
          const parsed = JSON.parse(event.data);
          if (text(parsed?.contract) !== REALTIME_CONTRACT) {
            throw new Error("AVANTIQO_VOICE_REALTIME_UPSTREAM_CONTRACT_INVALID");
          }
          sendClient(parsed);
        } catch {
          sendClient({
            type: "relay.error",
            contract: RELAY_CONTRACT,
            code: "AVANTIQO_VOICE_REALTIME_UPSTREAM_EVENT_INVALID",
          });
          finish(1011, "upstream event invalid");
        }
      });

      upstream.addEventListener("error", () => {
        sendClient({
          type: "relay.error",
          contract: RELAY_CONTRACT,
          code: "AVANTIQO_VOICE_REALTIME_UPSTREAM_FAILED",
        });
        finish(1011, "upstream failed");
      });

      upstream.addEventListener("close", (event) => {
        finish(
          event.code >= 1000 && event.code <= 4999 ? event.code : 1000,
          text(event.reason) || "upstream closed",
        );
      });

      sessionTimer = setTimeout(() => {
        sendClient({
          type: "relay.error",
          contract: RELAY_CONTRACT,
          code: "AVANTIQO_VOICE_REALTIME_SESSION_TIMEOUT",
        });
        finish(1000, "session timeout");
      }, SESSION_HARD_TIMEOUT_MS);
    });

    client.addEventListener("message", (event) => {
      if (closed) return;
      try {
        if (!upstreamReady || !upstream || upstream.readyState !== WebSocket.OPEN) {
          sendClient({
            type: "relay.not_ready",
            contract: RELAY_CONTRACT,
            session_id: sessionId,
          });
          return;
        }
        const validated = safeClientEvent(event.data, totalAudioChars);
        totalAudioChars = validated.totalAudioChars;
        upstream.send(JSON.stringify(validated.event));
      } catch (error) {
        sendClient({
          type: "relay.error",
          contract: RELAY_CONTRACT,
          code: text(error instanceof Error ? error.message : error) ||
            "AVANTIQO_VOICE_REALTIME_CLIENT_EVENT_INVALID",
        });
        finish(1008, "client event rejected");
      }
    });

    client.addEventListener("error", () => finish(1011, "client failed"));
    client.addEventListener("close", () => finish(1000, "client closed"));

    const edgeRuntime = (globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }).EdgeRuntime;
    edgeRuntime?.waitUntil?.(closedPromise);

    return response;
  } catch (error) {
    const message = text(error instanceof Error ? error.message : error);
    const status = message.includes("AUTH") ? 401
      : message.includes("ACCESS_DENIED") ? 403
      : message.includes("DISABLED") ||
          message.includes("NOT_CERTIFIED") ||
          message.includes("NOT_APPROVED")
      ? 503
      : 500;
    return responseError(error, status);
  }
});
