#!/usr/bin/env node

import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import {
  loadAvantiqoEnv,
} from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function required(name, value) {
  const resolved = text(value);
  if (!resolved) throw new Error(`${name}_REQUIRED`);
  return resolved;
}

try {
  const organizationId = required(
    "ORGANIZATION_ID",
    process.env.ORGANIZATION_ID,
  );
  const dossierId = required(
    "PRODUCTION_DOSSIER_ID",
    process.env.PRODUCTION_DOSSIER_ID,
  );
  const email = required(
    "APPROVER_EMAIL",
    process.env.APPROVER_EMAIL,
  );
  const password = required(
    "APPROVER_PASSWORD",
    process.env.APPROVER_PASSWORD,
  );
  const ceiling = finite(
    process.env.APPROVED_COST_CEILING ||
    process.env.PRODUCTION_BUDGET_CEILING,
  );
  if (ceiling === null || ceiling < 0) {
    throw new Error("APPROVED_COST_CEILING_REQUIRED");
  }

  const url = required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const anonKey = required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      transport: WebSocket,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  delete process.env.APPROVER_PASSWORD;

  if (error || !data?.session?.access_token || !data?.user?.id) {
    throw new Error(
      `AUTHENTICATION_FAILED:${error?.message || "session unavailable"}`,
    );
  }

  const request = new Request("http://localhost/terminal-approval", {
    headers: {
      authorization: `Bearer ${data.session.access_token}`,
    },
  });

  const [
    { requireOrganizationAccess },
    { CreativeApprovalRuntime },
  ] = await Promise.all([
    import("@/lib/platform/security/requireOrganizationAccess"),
    import("@/lib/creative/release/runtime/CreativeApprovalRuntime"),
  ]);

  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredPermission: "creative.release.approve",
    userEmail: email,
  });
  if (!access.success) {
    throw new Error(
      `APPROVAL_ACCESS_DENIED:${access.status}:${access.error}`,
    );
  }

  const approvalResult = await CreativeApprovalRuntime.approve({
    organization_id: organizationId,
    subject_asset_node_id: dossierId,
    scope: "PRODUCTION_DOSSIER",
    approved_cost_ceiling: ceiling,
    approver: {
      user_id: access.userId,
      staff_account_id: access.staff?.id,
      email: access.userEmail,
    },
    notes:
      process.env.APPROVAL_NOTES ||
      `APPROVE PRODUCTION DOSSIER ${dossierId} BUDGET ${ceiling} THB`,
  });

  await client.auth.signOut();

  console.log("============================================================");
  console.log("AUTHENTICATED PRODUCTION APPROVAL RECORDED");
  console.log("============================================================");
  console.log(`PRODUCTION_DOSSIER_ID=${dossierId}`);
  console.log(`APPROVAL_RECORD_ID=${approvalResult.approval?.id || "MISSING"}`);
  console.log(`APPROVER_USER_ID=${access.userId}`);
  console.log(`APPROVER_STAFF_ACCOUNT_ID=${access.staff?.id || "MISSING"}`);
  console.log(`APPROVED_COST_CEILING=${ceiling}`);
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("============================================================");

  await import("./run-approved-creative-production.mjs");
} catch (error) {
  delete process.env.APPROVER_PASSWORD;
  console.error("============================================================");
  console.error("TERMINAL APPROVAL OR PRODUCTION FAILED");
  console.error("============================================================");
  console.error(`ERROR=${error?.message || String(error)}`);
  console.error("PUBLICATION_AUTHORIZED=NO");
  console.error("PRODUCTION_STATUS=FAILED");
  console.error("TERMINAL_REMAINS_OPEN=YES");
  process.exitCode = 1;
}
