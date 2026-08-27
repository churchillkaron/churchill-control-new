import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/run-avantiqo-video-first-real-t2v-v47-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V47_NODE20_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

function replaceRangeExactlyOnce(source, startMarker, endMarker, replacement, label) {
  const startCount = source.split(startMarker).length - 1;
  const endCount = source.split(endMarker).length - 1;
  if (startCount !== 1 || endCount !== 1) {
    throw new Error(
      `AVANTIQO_VIDEO_V47_NODE20_${label}_MARKER_MISMATCH:start=${startCount}:end=${endCount}`,
    );
  }
  const start = source.indexOf(startMarker);
  const endStart = source.indexOf(endMarker, start);
  if (start < 0 || endStart < start) {
    throw new Error(`AVANTIQO_VIDEO_V47_NODE20_${label}_RANGE_INVALID`);
  }
  const end = endStart + endMarker.length;
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) {
  throw new Error(`AVANTIQO_VIDEO_V47_NODE20_LAUNCHER_NODE20_REQUIRED:${process.version}`);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

source = replaceExactlyOnce(
  source,
  'import { createClient } from "@supabase/supabase-js";\n',
  "",
  "REMOVE_SUPABASE_CLIENT_IMPORT",
);

source = replaceRangeExactlyOnce(
  source,
  'const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");',
  'if (!upload?.signedUrl) throw new Error("AVANTIQO_VIDEO_V47_SIGNED_UPLOAD_REQUIRED");',
  `const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\\/+$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const storageBase = \`\${supabaseUrl}/storage/v1\`;
const storageAuthHeaders = {
  Authorization: \`Bearer \${serviceRoleKey}\`,
  apikey: serviceRoleKey,
  Accept: "application/json",
};
async function storageJson(pathname, options = {}) {
  return readJson(await fetch(\`\${storageBase}\${pathname}\`, {
    method: options.method || "GET",
    headers: {
      ...storageAuthHeaders,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V47_STORAGE");
}
function storageAbsolute(relative) {
  const value = text(relative);
  if (!value) return "";
  if (/^https:\\/\\//i.test(value)) return value;
  return \`\${storageBase}\${value.startsWith("/") ? "" : "/"}\${value}\`;
}
const runId = \`video-v47-\${Date.now()}-\${crypto.randomUUID().slice(0, 8)}\`;
const storagePath = \`benchmark-video-v47/controlled-t2v/\${runId}.mp4\`;
const storageReference = \`storage://\${STORAGE_BUCKET}/\${storagePath}\`;
const signedUpload = await storageJson(
  \`/object/upload/sign/\${STORAGE_BUCKET}/\${storagePath}\`,
  { method: "POST", body: {} },
);
const signedUploadUrl = storageAbsolute(signedUpload.url);
let signedUploadToken = "";
try { signedUploadToken = new URL(signedUploadUrl).searchParams.get("token") || ""; } catch {}
if (!signedUploadUrl || !signedUploadToken) {
  throw new Error("AVANTIQO_VIDEO_V47_SIGNED_UPLOAD_REQUIRED");
}`,
  "SIGNED_UPLOAD_REST",
);

source = replaceExactlyOnce(
  source,
  "AVANTIQO_VIDEO_V47_SIGNED_UPLOAD_URL: upload.signedUrl,",
  "AVANTIQO_VIDEO_V47_SIGNED_UPLOAD_URL: signedUploadUrl,",
  "SIGNED_UPLOAD_ENV",
);

source = replaceRangeExactlyOnce(
  source,
  'const folder = storagePath.split("/").slice(0, -1).join("/");',
  'if (!review?.signedUrl) throw new Error("AVANTIQO_VIDEO_V47_REVIEW_URL_REQUIRED");',
  `const fileName = storagePath.split("/").at(-1);
const storedObjectResponse = await fetch(
  \`\${storageBase}/object/\${STORAGE_BUCKET}/\${storagePath}\`,
  {
    method: "HEAD",
    headers: storageAuthHeaders,
    signal: AbortSignal.timeout(30_000),
  },
);
if (!storedObjectResponse.ok) {
  throw new Error(\`AVANTIQO_VIDEO_V47_STORED_MP4_NOT_FOUND:HTTP_\${storedObjectResponse.status}\`);
}
const storedObjectSize = finite(storedObjectResponse.headers.get("content-length"), null);
const signedReview = await storageJson(
  \`/object/sign/\${STORAGE_BUCKET}/\${storagePath}\`,
  { method: "POST", body: { expiresIn: 60 * 60 } },
);
const reviewUrl = storageAbsolute(signedReview.signedURL || signedReview.signedUrl);
if (!reviewUrl || !/^https:\\/\\//i.test(reviewUrl)) {
  throw new Error("AVANTIQO_VIDEO_V47_REVIEW_URL_REQUIRED");
}`,
  "VERIFY_AND_REVIEW_REST",
);

source = replaceExactlyOnce(
  source,
  "stored_object_name: text(stored.name),",
  "stored_object_name: fileName,",
  "STORED_OBJECT_NAME",
);
source = replaceExactlyOnce(
  source,
  "stored_object_size: finite(stored.metadata?.size ?? stored.metadata?.contentLength, null),",
  "stored_object_size: storedObjectSize,",
  "STORED_OBJECT_SIZE",
);
source = replaceExactlyOnce(
  source,
  "review_url: review.signedUrl,",
  "review_url: reviewUrl,",
  "REVIEW_URL",
);

if (source.includes("@supabase/supabase-js") || source.includes("createClient(") || source.includes("supabase.storage")) {
  throw new Error("AVANTIQO_VIDEO_V47_NODE20_SUPABASE_CLIENT_REFERENCE_REMAINS");
}

console.log(`AVANTIQO_VIDEO_V47_NODE20_STORAGE_TRANSPORT=${JSON.stringify({
  base_script: BASE,
  node: process.version,
  storage_transport: "SUPABASE_STORAGE_REST",
  supabase_js_loaded: false,
  realtime_loaded: false,
  websocket_required: false,
  runpod_contract_changed: false,
  safe_lease_changed: false,
  generation_parameters_changed: false,
  image_endpoint_mutation: false,
})}`);

const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
