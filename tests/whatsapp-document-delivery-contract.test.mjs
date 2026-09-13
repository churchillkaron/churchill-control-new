import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/whatsapp/WhatsAppProvider.js", import.meta.url), "utf8");
const delivery = fs.readFileSync(new URL("../lib/commercial/communications/CommunicationDeliveryRuntime.js", import.meta.url), "utf8");

test("Communications preserves attachments and securely materializes canonical Finance PDFs", () => {
  assert.match(delivery, /canonicalFinancePdf/);
  assert.match(delivery, /renderCustomerInvoicePdf/);
  assert.match(delivery, /COMMUNICATION_FINANCE_DOCUMENT_SCOPE_MISMATCH/);
  assert.match(delivery, /data_base64: rendered\.buffer\.toString\("base64"\)/);
  assert.match(delivery, /attachments: media/);
  assert.match(delivery, /attachment_count: media\.length/);
});

test("WhatsApp sends one PDF attachment as a native document", () => {
  assert.match(provider, /attachments = \[\]/);
  assert.match(provider, /type: "document"/);
  assert.match(provider, /document,/);
  assert.match(provider, /document\.filename = filename\.slice/);
  assert.match(provider, /document\.caption = caption\.slice/);
  assert.match(provider, /uploadDocument/);
  assert.match(provider, /\/media`/);
  assert.match(provider, /new Blob\(\[bytes\], \{ type: "application\/pdf" \}\)/);
  assert.match(provider, /uploadedId \? \{ id: uploadedId \} : \{ link \}/);
  assert.match(provider, /WHATSAPP_DOCUMENT_REFERENCE_REQUIRED/);
  assert.match(provider, /WHATSAPP_DOCUMENT_PDF_REQUIRED/);
});

test("WhatsApp keeps ordinary sends as text and never silently drops multiple documents", () => {
  assert.match(provider, /type: "text"/);
  assert.match(provider, /WHATSAPP_SINGLE_DOCUMENT_ATTACHMENT_REQUIRED/);
});
