const CANONICAL_WORKFORCE_ORIGIN = "https://avantiqo.ai";
const REQUIRED_PASSKEY_RP_ID = "avantiqo.ai";
const PROBE_CACHE_MS = 5 * 60 * 1000;

let cachedProbe = null;
let cachedAt = 0;

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeCode(payload) {
  return String(
    payload?.code || payload?.error_code || payload?.errorCode || ""
  )
    .trim()
    .toLowerCase();
}

function messageOf(payload, fallback) {
  return String(payload?.message || payload?.msg || payload?.error || fallback || "").trim();
}

function cacheProbe(result, nowMs) {
  cachedProbe = result;
  cachedAt = nowMs;
  return result;
}

export async function probeHostedPasskeyConfiguration({
  now = new Date(),
  force = false,
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();

  if (
    !force &&
    cachedProbe &&
    safeNowMs - cachedAt >= 0 &&
    safeNowMs - cachedAt < PROBE_CACHE_MS
  ) {
    return cachedProbe;
  }

  const supabaseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const apiKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !apiKey) {
    return cacheProbe(
      {
        reachable: false,
        enabled: null,
        rpId: null,
        rpIdMatches: false,
        configurationReady: false,
        error: "Supabase public Auth configuration is unavailable on the server",
      },
      safeNowMs
    );
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/passkeys/authentication/options`,
      {
        method: "POST",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      }
    );

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const code = normalizeCode(payload);
      const disabled = code === "passkey_disabled";

      return cacheProbe(
        {
          reachable: true,
          enabled: disabled ? false : null,
          rpId: null,
          rpIdMatches: false,
          configurationReady: false,
          error: messageOf(
            payload,
            disabled
              ? "Hosted Supabase Passkeys are disabled"
              : `Hosted Supabase Passkey probe failed with HTTP ${response.status}`
          ),
        },
        safeNowMs
      );
    }

    const rpId = String(payload?.options?.rpId || "").trim() || null;
    const rpIdMatches = rpId === REQUIRED_PASSKEY_RP_ID;

    return cacheProbe(
      {
        reachable: true,
        enabled: true,
        rpId,
        rpIdMatches,
        configurationReady: rpIdMatches,
        error: rpIdMatches
          ? null
          : `Hosted Supabase Passkey RP ID must be ${REQUIRED_PASSKEY_RP_ID}`,
      },
      safeNowMs
    );
  } catch (error) {
    return cacheProbe(
      {
        reachable: false,
        enabled: null,
        rpId: null,
        rpIdMatches: false,
        configurationReady: false,
        error:
          error?.message || "Unable to reach hosted Supabase Passkey configuration",
      },
      safeNowMs
    );
  }
}

export {
  CANONICAL_WORKFORCE_ORIGIN,
  REQUIRED_PASSKEY_RP_ID,
  PROBE_CACHE_MS,
};

export default probeHostedPasskeyConfiguration;
