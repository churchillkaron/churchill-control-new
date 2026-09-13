import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/whatsapp/WhatsAppProvider.js", import.meta.url), "utf8");
const delivery = fs.readFileSync(new URL("../lib/commercial/communications/CommunicationDeliveryRuntime.js", import.meta.url), "utf8");

test("Communications preserves outbound attachments into governed service execution", () => {
  assert.match(delivery, /const media = attachments\.map/);
  assert.match(delivery, /attachments: media/);
  assert.match(delivery, /attachment_count: media\.length/);
});

test("WhatsApp sends one public PDF attachment as a native document", () => {
  assert.match(provider, /attachments = \[\]/);
  assert.match(provider, /type: "document"/);
  assert.match(provider, /document,/);
  assert.match(provider, /document\.filename = filename\.slice/);
  assert.match(provider, /document\.caption = caption\.slice/);
  assert.match(provider, /WHATSAPP_DOCUMENT_PUBLIC_URL_REQUIRED/);
  assert.match(provider, /WHATSAPP_DOCUMENT_PDF_REQUIRED/);
});

test("WhatsApp keeps ordinary sends as text and never silently drops multiple documents", () => {
  assert.match(provider, /type: "text"/);
  assert.match(provider, /WHATSAPP_SINGLE_DOCUMENT_ATTACHMENT_REQUIRED/);
});
