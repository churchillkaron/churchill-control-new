import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const diagnosticPath = new URL(
  "../lib/platform/service-runtime/providers/whatsapp/WhatsAppConnectionDiagnosticRuntime.js",
  import.meta.url,
);
const routePath = new URL(
  "../app/api/administration/integrations/whatsapp/validate/route.js",
  import.meta.url,
);
const cardPath = new URL(
  "../components/administration/integrations/WhatsAppIntegrationCard.jsx",
  import.meta.url,
);

async function source(path) {
  return readFile(path, "utf8");
}

test("WhatsApp diagnostic remains read-only and never sends messages", async () => {
  const diagnostic = await source(diagnosticPath);

  assert.match(diagnostic, /method:\s*"GET"/);
  assert.doesNotMatch(diagnostic, /\/messages\b/);
  assert.doesNotMatch(diagnostic, /method:\s*"POST"/);
  assert.match(diagnostic, /CredentialRuntime\.resolve\(credentialId\)/);
  assert.match(diagnostic, /token_accepted:\s*true/);
});

test("WhatsApp validation endpoint is authenticated and GET-only", async () => {
  const route = await source(routePath);

  assert.match(route, /export async function GET\(request\)/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /inspectWhatsAppConnection/);
});

test("WhatsApp refresh UI uses the read-only validator", async () => {
  const card = await source(cardPath);

  assert.match(card, /async function validateConnection\(\)/);
  assert.match(card, /\/api\/administration\/integrations\/whatsapp\/validate\?organizationId=/);
  assert.match(card, /onClick=\{validateConnection\}/);
  assert.match(card, /Validating…/);
  assert.match(card, /verified with Meta/);
});
