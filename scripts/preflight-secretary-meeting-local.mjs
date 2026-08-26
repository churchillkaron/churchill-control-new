import { createClient } from "@supabase/supabase-js";

function text(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function required(name) {
  const value = text(process.env[name], 12000);
  if (!value) throw new Error(`SECRETARY_MEETING_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_MEETING_LOCAL_SUPABASE_URL_INVALID");
  }
  const localHost = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  if (!localHost) {
    throw new Error("SECRETARY_MEETING_LOCAL_PREFLIGHT_REFUSED_NON_LOCAL_SUPABASE");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SECRETARY_MEETING_LOCAL_SUPABASE_PROTOCOL_INVALID");
  }
  return url;
}

async function tableReady(client, table) {
  const result = await client.from(table).select("*", { count: "exact", head: true });
  if (result.error) {
    throw new Error(`SECRETARY_MEETING_LOCAL_SCHEMA_NOT_READY:${table}:${result.error.code || "UNKNOWN"}`);
  }
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const parsedUrl = assertLocalSupabase(supabaseUrl);

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

for (const table of [
  "secretary_meetings",
  "secretary_meeting_participants",
  "secretary_meeting_segments",
  "secretary_meeting_action_items",
  "secretary_jobs",
  "secretary_job_steps",
  "secretary_meeting_audio_chunks",
  "secretary_prospects",
  "secretary_job_responses",
  "secretary_job_comparisons",
]) {
  await tableReady(client, table);
}

console.log("SECRETARY_MEETING_LOCAL_PREFLIGHT=PASS");
console.log(`SECRETARY_MEETING_LOCAL_SUPABASE_HOST=${parsedUrl.hostname}`);
console.log(`SECRETARY_MEETING_LOCAL_SUPABASE_PORT=${parsedUrl.port || "default"}`);
console.log("SECRETARY_MEETING_LOCAL_SCHEMA=PASS");
console.log("SECRETARY_MEETING_LOCAL_PREFLIGHT_READ_ONLY=true");
console.log("SECRETARY_MEETING_LOCAL_SECRETS_PRINTED=false");
console.log("SECRETARY_MEETING_LOCAL_MUTATION_PERFORMED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
