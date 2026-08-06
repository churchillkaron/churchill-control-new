import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const INSTALL_KEY = Symbol.for(
  "avantiqo.supabase-storage-fetch-runtime.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  return text(input?.url);
}

function decodePath(value) {
  return value
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

export function parseSupabaseStorageLocator(value) {
  const source = text(value);
  if (!source) return null;

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }

  const pathname = parsed.pathname;
  const markers = [
    "/storage/v1/object/public/",
    "/storage/v1/object/sign/",
    "/storage/v1/object/authenticated/",
    "/storage/v1/object/",
  ];

  for (const marker of markers) {
    const index = pathname.indexOf(marker);
    if (index < 0) continue;
    const remainder = pathname.slice(index + marker.length);
    const slash = remainder.indexOf("/");
    if (slash <= 0 || slash === remainder.length - 1) return null;

    const bucket = decodePath(remainder.slice(0, slash));
    const objectPath = decodePath(remainder.slice(slash + 1));
    if (!bucket || !objectPath) return null;

    return {
      contract: "SUPABASE_STORAGE_URL_LOCATOR_V1",
      source_url: source,
      host: parsed.host,
      marker,
      bucket,
      object_path: objectPath,
    };
  }

  return null;
}

function inferredMime(value = "") {
  const source = text(value).toLowerCase().split(/[?#]/)[0];
  if (source.endsWith(".png")) return "image/png";
  if (source.endsWith(".webp")) return "image/webp";
  if (source.endsWith(".gif")) return "image/gif";
  if (source.endsWith(".avif")) return "image/avif";
  if (source.endsWith(".mp4")) return "video/mp4";
  if (source.endsWith(".mov")) return "video/quicktime";
  if (source.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}

export async function downloadSupabaseStorageObject(locator) {
  if (!locator?.bucket || !locator?.object_path) {
    throw new Error("SUPABASE_STORAGE_LOCATOR_REQUIRED");
  }

  const { data, error } = await supabaseAdmin.storage
    .from(locator.bucket)
    .download(locator.object_path);

  if (error) {
    throw new Error(
      `SUPABASE_STORAGE_ADMIN_DOWNLOAD_FAILED:${locator.bucket}:${locator.object_path}:${error.message || error}`,
    );
  }
  if (!data) {
    throw new Error(
      `SUPABASE_STORAGE_ADMIN_DOWNLOAD_EMPTY:${locator.bucket}:${locator.object_path}`,
    );
  }

  return data;
}

export async function fetchWithSupabaseStorageRecovery(
  nativeFetch,
  input,
  init,
) {
  const url = requestUrl(input);
  const locator = parseSupabaseStorageLocator(url);
  let response = null;
  let directError = null;

  try {
    response = await nativeFetch(input, init);
    if (response.ok || !locator) return response;
  } catch (error) {
    directError = error;
    if (!locator) throw error;
  }

  const method = text(
    init?.method ||
      (typeof Request !== "undefined" && input instanceof Request
        ? input.method
        : "GET"),
  ).toUpperCase() || "GET";
  if (!new Set(["GET", "HEAD"]).has(method)) {
    if (directError) throw directError;
    return response;
  }

  try {
    const blob = await downloadSupabaseStorageObject(locator);
    const contentType = text(blob.type) || inferredMime(locator.object_path);
    const headers = new Headers({
      "content-type": contentType,
      "x-avantiqo-storage-recovery": "SUPABASE_ADMIN_DOWNLOAD",
      "x-avantiqo-storage-bucket": locator.bucket,
    });

    if (method === "HEAD") {
      headers.set("content-length", String(blob.size || 0));
      return new Response(null, { status: 200, headers });
    }

    const bytes = await blob.arrayBuffer();
    headers.set("content-length", String(bytes.byteLength));
    return new Response(bytes, { status: 200, headers });
  } catch (recoveryError) {
    if (directError) {
      throw new Error(
        `SUPABASE_STORAGE_FETCH_AND_RECOVERY_FAILED:${directError.message || directError}:${recoveryError.message || recoveryError}`,
      );
    }
    throw new Error(
      `SUPABASE_STORAGE_HTTP_${response?.status || "UNKNOWN"}_RECOVERY_FAILED:${recoveryError.message || recoveryError}`,
    );
  }
}

function install() {
  if (globalThis[INSTALL_KEY]) return globalThis[INSTALL_KEY];
  if (typeof globalThis.fetch !== "function") {
    throw new Error("GLOBAL_FETCH_REQUIRED_FOR_SUPABASE_STORAGE_RECOVERY");
  }

  const nativeFetch = globalThis.fetch.bind(globalThis);
  const patchedFetch = async (input, init) =>
    fetchWithSupabaseStorageRecovery(nativeFetch, input, init);

  globalThis.fetch = patchedFetch;
  const installation = Object.freeze({
    contract: "SUPABASE_STORAGE_FETCH_RUNTIME_V1",
    installed: true,
    direct_http_attempted_first: true,
    admin_storage_recovery_enabled: true,
  });
  globalThis[INSTALL_KEY] = installation;
  return installation;
}

export const SupabaseStorageFetchRuntime = Object.freeze({
  contract: "SUPABASE_STORAGE_FETCH_RUNTIME_V1",
  parse: parseSupabaseStorageLocator,
  download: downloadSupabaseStorageObject,
  fetch: fetchWithSupabaseStorageRecovery,
  installation: install(),
});
