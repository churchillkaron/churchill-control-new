import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const DEFAULT_MAX_AGE_MS = 2 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 60 * 1000;

function passkeyRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.passkeys)) return data.passkeys;
  return [];
}

export async function loadStaffPasskeyStatus({ userId }) {
  if (!userId) {
    return {
      enrolled: false,
      count: 0,
      lastUsedAt: null,
    };
  }

  const { data, error } = await supabaseAdmin.auth.admin.passkey.listPasskeys({
    userId,
  });

  if (error) throw error;

  const passkeys = passkeyRows(data);
  const lastUsedAt = passkeys
    .map((passkey) => passkey?.last_used_at || null)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    enrolled: passkeys.length > 0,
    count: passkeys.length,
    lastUsedAt,
  };
}

export async function requireRecentPasskeyVerification({
  userId,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}) {
  if (!userId) {
    const error = new Error("Authenticated user is required for passkey verification");
    error.status = 401;
    error.code = "CLOCK_IN_PASSKEY_USER_REQUIRED";
    throw error;
  }

  const status = await loadStaffPasskeyStatus({ userId });

  if (!status.enrolled) {
    const error = new Error(
      "A passkey must be registered before you can start a shift"
    );
    error.status = 403;
    error.code = "CLOCK_IN_PASSKEY_NOT_ENROLLED";
    throw error;
  }

  if (!status.lastUsedAt) {
    const error = new Error(
      "Verify your identity with Face ID, Touch ID, Windows Hello, or your passkey before starting your shift"
    );
    error.status = 403;
    error.code = "CLOCK_IN_PASSKEY_REQUIRED";
    throw error;
  }

  const lastUsed = new Date(status.lastUsedAt);
  if (Number.isNaN(lastUsed.getTime())) {
    const error = new Error("Passkey verification evidence is invalid");
    error.status = 403;
    error.code = "CLOCK_IN_PASSKEY_INVALID";
    throw error;
  }

  const ageMs = now.getTime() - lastUsed.getTime();
  if (ageMs > maxAgeMs || ageMs < -FUTURE_TOLERANCE_MS) {
    const error = new Error(
      "Passkey verification expired. Verify your identity again to start your shift"
    );
    error.status = 403;
    error.code = "CLOCK_IN_PASSKEY_EXPIRED";
    throw error;
  }

  return {
    verified: true,
    verifiedAt: lastUsed.toISOString(),
    maxAgeSeconds: Math.round(maxAgeMs / 1000),
  };
}

export { DEFAULT_MAX_AGE_MS };
