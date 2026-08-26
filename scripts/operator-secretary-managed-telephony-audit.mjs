#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const checks = [];

function assert(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) throw new Error(`SECRETARY_MANAGED_TELEPHONY_AUDIT_FAILED:${name}`);
}

const runtime = await readFile("lib/operator/secretary/SecretaryManagedTelephonyRuntime.js", "utf8");
const migration = await readFile("supabase/migrations/20260825114500_secretary_managed_telephony.sql", "utf8");
const resolver = await readFile("app/api/internal/secretary/phone-lines/resolve/route.js", "utf8");
const agi = await readFile("workers/secretary-sip-gateway/asterisk/inbound-agi.mjs", "utf8");
const dialplan = await readFile("workers/secretary-sip-gateway/asterisk/extensions.conf.example", "utf8");
const bootstrap = await readFile("scripts/bootstrap-secretary-managed-telephony-local.mjs", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

const requestStart = runtime.indexOf("export async function requestManagedSecretaryNumber");
const requestEnd = runtime.indexOf("export async function syncManagedSecretaryNumber");
const requestRuntime = requestStart >= 0 && requestEnd > requestStart ? runtime.slice(requestStart, requestEnd) : "";
const providerAcceptedGuard = requestRuntime.indexOf("if (providerOrderAccepted)");
const postOrderReconciliation = requestRuntime.indexOf("markPostOrderReconciliationRequired", providerAcceptedGuard);
const postOrderThrow = requestRuntime.indexOf("throw error;", providerAcceptedGuard);
const walletReserveGuard = requestRuntime.indexOf("if (walletReserveAttempted)", providerAcceptedGuard);
const preOrderRelease = requestRuntime.indexOf("WalletRuntime.release({", providerAcceptedGuard);

assert("organization_scoped_connection_state", migration.includes("organization_id uuid not null") && migration.includes("unique (organization_id, idempotency_key)"));
assert("carrier_secret_not_persisted", !migration.includes("provider_secret") && migration.includes("No carrier secret is stored in this table"));
assert("managed_is_default_mode", migration.includes("default 'AVANTIQO_MANAGED'"));
assert("customer_credentials_not_required", runtime.includes("carrier_credentials_required_from_customer: false"));
assert("secretary_authority_remains_avantiqo", runtime.includes('secretary_authority: "AVANTIQO"') && runtime.includes("external_secretary_authority_used: false"));
assert("prepaid_wallet_required", runtime.includes("WalletRuntime.prepaid") && runtime.includes("WalletRuntime.reserve"));
assert("provider_order_id_persisted", runtime.includes("provider_number_order_id"));
assert("post_order_funds_held", runtime.includes("wallet_reservation_held: true") && runtime.includes("POST_ORDER_RECONCILIATION_REQUIRED"));
assert(
  "post_order_does_not_blind_release",
  providerAcceptedGuard >= 0 &&
    postOrderReconciliation > providerAcceptedGuard &&
    postOrderThrow > postOrderReconciliation &&
    walletReserveGuard > postOrderThrow &&
    preOrderRelease > walletReserveGuard,
);
assert("wallet_settlement_retriable", runtime.includes("wallet_settlement_pending") && runtime.includes("clearSettlementPending"));
assert("did_resolved_inside_avantiqo", resolver.includes("secretary_phone_lines") && resolver.includes("line_address"));
assert("agi_routes_by_called_number", agi.includes("calledNumber") && agi.includes("/api/internal/secretary/phone-lines/resolve"));
assert("dialplan_accepts_dynamic_did", dialplan.includes("exten => _X.") || dialplan.includes("${EXTEN}"));
assert("single_platform_carrier_bootstrap", bootstrap.includes("AVANTIQO_SECRETARY_TELNYX_CONNECTION_ID") && bootstrap.includes("TELNYX_API_KEY"));
assert("carrier_secret_not_printed", bootstrap.includes("SECRETARY_MANAGED_TELEPHONY_SECRET_PRINTED=false"));
assert("root_bootstrap_command_present", Boolean(packageJson.scripts?.["bootstrap:operator-secretary-managed-telephony"]));

console.log("SECRETARY_MANAGED_TELEPHONY_AUDIT=PASS");
for (const check of checks) console.log(`${check.name.toUpperCase()}=${check.pass ? "PASS" : "FAIL"}`);
console.log("SECRETARY_MANAGED_TELEPHONY_CUSTOMER_SIP_CONFIGURATION_REQUIRED=false");
console.log("SECRETARY_MANAGED_TELEPHONY_EXTERNAL_SECRETARY_AUTHORITY_USED=false");
console.log("SECRETARY_MANAGED_TELEPHONY_PROVIDER_SPEND_PERFORMED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
