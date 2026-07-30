#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  if (!String(process.env[name] || "").trim()) {
    throw new Error(`Missing environment variable after loadEnvConfig: ${name}`);
  }
}

await import("../lib/creative/director/runtime/CreativeDirectionReliableOutputPatch.js");
await import("./creative-studio-full-song-safe-execute.mjs");
