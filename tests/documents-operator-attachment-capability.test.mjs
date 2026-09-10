import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const capability = readFileSync('lib/documents/runtime/DocumentsOperatorCapability.js','utf8');
const domains = readFileSync('lib/ubte/runtime/domains/DomainRuntimeRegistry.js','utf8');
const attachment = readFileSync('lib/platform/runtime/ConversationAttachmentRuntime.js','utf8');

test('Documents owns a governed attachment create capability', () => {
  assert.match(capability, /domain: "documents"/);
  assert.match(capability, /capability: "files"/);
  assert.match(capability, /action: "create"/);
  assert.match(capability, /operatorRequiresConfirmation: true/);
  assert.match(domains, /documents: async/);
});

test('document capability reauthorizes caller and reloads scoped private attachment', () => {
  assert.match(capability, /requireOrganizationAccess/);
  assert.match(capability, /context\.callerRequest/);
  assert.match(capability, /DOCUMENT_EXECUTION_ACTOR_MISMATCH/);
  assert.match(capability, /loadConversationAttachmentSet/);
  assert.match(capability, /attachment_set_id/);
  assert.match(capability, /file_id/);
  assert.match(capability, /createControlledDocument/);
  assert.doesNotMatch(capability, /service_role/i);
});

test('loaded attachment retains set identity for confirmation resume', () => {
  assert.match(attachment, /attachment_set_id: setId/);
});
