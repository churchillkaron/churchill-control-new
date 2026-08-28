const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "cinema-production";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function supabaseBaseUrl() {
  return required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
}

function supabaseServiceRoleKey() {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}

async function supabaseRequest(pathname) {
  const key = supabaseServiceRoleKey();
  const response = await fetch(`${supabaseBaseUrl()}${pathname}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Cache-Control": "no-store",
    },
    signal: AbortSignal.timeout(15_000),
  });

  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }

  if (!response.ok) {
    const detail = text(parsed?.message || parsed?.details || parsed?.hint || parsed?.code || raw)
      .replace(/\s+/g, " ")
      .slice(0, 500);
    const error = new Error(
      `AVANTIQO_VIDEO_DISTRIBUTED_LEASE_REQUEST_FAILED:${response.status}:${detail || "UNKNOWN"}`,
    );
    error.httpStatus = response.status;
    error.supabaseCode = text(parsed?.code) || null;
    error.detail = detail || null;
    throw error;
  }

  return parsed;
}

function isSchemaNotInstalled(error) {
  const code = text(error?.supabaseCode).toUpperCase();
  const detail = text(error?.detail || error?.message).toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    ((Number(error?.httpStatus) === 404 || Number(error?.httpStatus) === 400) &&
      detail.includes("avantiqo_video_runpod_leases") &&
      (detail.includes("schema cache") || detail.includes("does not exist") || detail.includes("could not find")))
  );
}

export function isVideoRunpodLane(lane) {
  return text(lane) === LANE;
}

export async function listActiveVideoRunpodDistributedLeases() {
  const now = encodeURIComponent(new Date().toISOString());
  let rows;
  try {
    rows = await supabaseRequest(
      `/rest/v1/avantiqo_video_runpod_leases?select=id,contract,lane,endpoint_id,endpoint_name,state,expires_at&state=eq.ACTIVE&expires_at=gt.${now}`,
    );
  } catch (error) {
    if (isSchemaNotInstalled(error)) return [];
    throw error;
  }

  if (!Array.isArray(rows)) {
    throw new Error("AVANTIQO_VIDEO_DISTRIBUTED_LEASE_LIST_INVALID");
  }

  return rows.filter((lease) =>
    lease?.contract === CONTRACT &&
    lease?.state === "ACTIVE" &&
    isVideoRunpodLane(lease?.lane) &&
    text(lease?.endpoint_id)
  );
}
