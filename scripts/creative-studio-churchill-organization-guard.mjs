#!/usr/bin/env node

import process from "node:process";
import nextEnv from "@next/env";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

export const CHURCHILL_ORGANIZATION_ID =
  "33336a72-acb5-474e-856b-8be0269360e2";
export const CHURCHILL_ORGANIZATION_NAME =
  "Churchill Restaurant & Bar";

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const suppliedOrganizationId = text(
  process.env.CHURCHILL_SMOKE_ORGANIZATION_ID ||
  process.env.CREATIVE_SMOKE_ORGANIZATION_ID,
);

if (
  suppliedOrganizationId &&
  suppliedOrganizationId !== CHURCHILL_ORGANIZATION_ID
) {
  throw new Error(
    "CHURCHILL_ORGANIZATION_SCOPE_MISMATCH: " +
    `expected ${CHURCHILL_ORGANIZATION_ID}, received ${suppliedOrganizationId}`,
  );
}

process.env.CHURCHILL_SMOKE_ORGANIZATION_ID =
  CHURCHILL_ORGANIZATION_ID;

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

const supabaseUrl = text(
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const serviceRoleKey = text(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY,
);

if (!supabaseUrl) throw new Error("SUPABASE_URL required");
if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

const { data: organization, error } = await client
  .from("organizations")
  .select("id,name")
  .eq("id", CHURCHILL_ORGANIZATION_ID)
  .maybeSingle();

if (error) {
  throw new Error(`CHURCHILL_ORGANIZATION_LOOKUP_FAILED: ${error.message}`);
}
if (!organization) {
  throw new Error("CHURCHILL_ORGANIZATION_NOT_FOUND");
}

const actualName = normalized(organization.name);
const expectedName = normalized(CHURCHILL_ORGANIZATION_NAME);

if (
  actualName !== expectedName &&
  !actualName.includes("churchill restaurant")
) {
  throw new Error(
    "CHURCHILL_ORGANIZATION_NAME_MISMATCH: " +
    `expected ${CHURCHILL_ORGANIZATION_NAME}, received ${organization.name}`,
  );
}

console.log("CHURCHILL_ORGANIZATION_GUARD=PASS");
console.log(`ORGANIZATION_ID=${organization.id}`);
console.log(`ORGANIZATION_NAME=${organization.name}`);
