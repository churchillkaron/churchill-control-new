import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260918183000_finance_provider_activation_vault.sql");
const route = read("app/api/finance/provider-activation/route.js");
const form = read("components/workspace/finance/FinanceProviderActivationForm.jsx");
const bankPanel = read("components/workspace/finance/FinanceBankFeedConnectionPanel.jsx");
const etaxPanel = read("components/workspace/finance/FinanceEInvoicePanel.jsx");
const portal = read("components/workspace/finance/FinancePracticeClientPortal.jsx");
const provider = read("lib/finance/e-invoicing/providers/CertifiedEtaxRestProvider.js");

test("Finance provider vault provisioner is service-role-only and allowlisted", () => {
  assert.match(migration, /FINANCE_PROVIDER_PROVISION_SERVICE_ROLE_REQUIRED/);
  assert.match(migration, /brankas_statement/);
  assert.match(migration, /certified_etax_rest/);
  assert.match(migration, /netbay_invoicechain/);
  assert.match(migration, /inet_etax/);
  assert.match(migration, /FINANCE_PROVIDER_UNSUPPORTED/);
  assert.match(migration, /revoke all on function public\.provision_finance_provider_credential.*authenticated/);
  assert.match(migration, /grant execute on function public\.provision_finance_provider_credential.*service_role/);
});

test("raw Finance provider secrets stay in Vault and cannot be smuggled into metadata", () => {
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /vault\.update_secret/);
  assert.match(migration, /secret_reference/);
  assert.match(migration, /FINANCE_PROVIDER_SECRET_METADATA_FORBIDDEN/);
  assert.match(migration, /api_key.*access_token.*password.*secret.*server_key.*private_key.*client_secret/s);
  assert.doesNotMatch(route, /select\([^)]*secret_reference/);
  assert.doesNotMatch(route, /credential:\s*\{[^}]*api_key/s);
});

test("activation API requires Finance configuration authority", () => {
  assert.match(route, /finance\.configuration\.manage/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /provision_finance_provider_credential/);
});

test("bank activation provisions Brankas and rebinds pending transaction-feed connections", () => {
  assert.match(route, /action === "activate_bank_feed"/);
  assert.match(route, /providerId: "brankas_statement"/);
  assert.match(route, /credentialType: "finance_bank_feed_api"/);
  assert.match(route, /secretPayload: \{ api_key: apiKey \}/);
  assert.match(route, /provider_credential_id: credential\.credential_id/);
  assert.match(route, /status: "PENDING_CONSENT"/);
  assert.match(route, /PENDING_CREDENTIAL/);
  assert.match(form, /Install Brankas credential/);
  assert.match(form, /Stored only in Supabase Vault/);
  assert.match(bankPanel, /FinanceProviderActivationForm mode="bank"/);
});

test("e-Tax activation binds exact provider credential and Thailand customer-invoice profile", () => {
  assert.match(route, /action === "activate_etax"/);
  assert.match(route, /credentialType: "finance_etax_provider"/);
  assert.match(route, /network: "TH_RD_ETAX"/);
  assert.match(route, /jurisdiction_code: "TH"/);
  assert.match(route, /document_type: "CUSTOMER_INVOICE"/);
  assert.match(route, /standard_code: "ETDA_CII"/);
  assert.match(route, /standard_version: "2\.0"/);
  assert.match(route, /selectedProfile/);
  assert.match(form, /Netbay InvoiceChain/);
  assert.match(form, /INET One E-Tax/);
  assert.match(etaxPanel, /FinanceProviderActivationForm mode="etax"/);
});

test("e-Tax server key is read from the Vault secret payload, not required in provider metadata", () => {
  assert.match(provider, /credentials\.server_key \|\| config\.server_key/);
  assert.match(route, /server_key: text\(body\.serverKey/);
  assert.doesNotMatch(route, /metadata\s*=\s*\{[^}]*server_key:/s);
});

test("activation form requires HTTPS endpoints and never renders existing secret values", () => {
  assert.match(route, /HTTPS Brankas base URL required/);
  assert.match(route, /HTTPS certified-provider base URL required/);
  assert.match(form, /type="password"/);
  assert.match(form, /autoComplete="new-password"/);
  assert.doesNotMatch(form, /secret_reference/);
});

test("portal mailbox blocker hands off to the existing Administration email connector", () => {
  assert.match(portal, /administration\/integrations\/email-connect/);
  assert.match(portal, /Connect email/);
  assert.match(route, /setup_path: `\/workspace\/\$\{organizationId\}\/administration\/integrations\/email-connect`/);
});
