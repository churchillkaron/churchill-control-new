#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { createServerClient } from "@supabase/ssr";

function parseEnvFiles() {
  const values = {};

  for (const filename of [".env", ".env.local"]) {
    if (!fs.existsSync(filename)) continue;

    const content = fs.readFileSync(filename, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const normalized = line.startsWith("export ")
        ? line.slice(7).trim()
        : line;
      const separator = normalized.indexOf("=");
      if (separator < 1) continue;

      const name = normalized.slice(0, separator).trim();
      let value = normalized.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[name] = value;
    }
  }

  return values;
}

const env = { ...parseEnvFiles(), ...process.env };
const url = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").trim();
const anonKey = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "").trim();
const email = String(env.FINANCE_SMOKE_EMAIL || "").trim();
const password = String(env.FINANCE_SMOKE_PASSWORD || "");

if (!url || !anonKey || !email || !password) {
  console.error("Missing Supabase URL, anon key, FINANCE_SMOKE_EMAIL or FINANCE_SMOKE_PASSWORD");
  process.exit(1);
}

const cookieJar = new Map();
const supabase = createServerClient(url, anonKey, {
  cookies: {
    getAll() {
      return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
    },
    setAll(cookiesToSet) {
      for (const cookie of cookiesToSet) {
        cookieJar.set(cookie.name, cookie.value);
      }
    },
  },
});

const { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (error || !data?.session || !data?.user) {
  console.error(error?.message || "Unable to create Supabase session");
  process.exit(1);
}

const cookieHeader = [...cookieJar.entries()]
  .map(([name, value]) => `${name}=${value}`)
  .join("; ");

if (!cookieHeader) {
  console.error("Supabase SSR client did not produce a session cookie");
  process.exit(1);
}

process.stdout.write(JSON.stringify({
  accessToken: data.session.access_token,
  cookieHeader,
  userId: data.user.id,
  userEmail: data.user.email || null,
}));
