import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inferredVerificationDeclaration } from "../lib/operator/runtime/OperatorCapabilityVerificationDeclaration.mjs";

const source = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("generated locator inference requires one exact required stable read locator", () => {
  const write = { domain:"platform", capability:"secretary_event_coordination", action:"start", mode:"write", input_schema:{type:"object",properties:{title:{type:"string"}}} };
  const read = { key:"platform.secretary_event_coordination.read", domain:"platform", capability:"secretary_event_coordination", action:"read", mode:"read", input_schema:{type:"object",required:["coordination_id"],properties:{coordination_id:{type:"string"}}} };
  assert.deepEqual(inferredVerificationDeclaration(write,[write,read]), {
    capability_key: read.key,
    payload_from_result: { coordination_id: ["coordination_id"] },
    derivation: "same_capability_registered_read_result_locator",
  });
});

test("generated locator inference refuses ambiguous multi-locator reads", () => {
  const write = { domain:"platform", capability:"x", action:"create", mode:"write", input_schema:{type:"object",properties:{name:{type:"string"}}} };
  const read = { key:"platform.x.read", domain:"platform", capability:"x", action:"read", mode:"read", input_schema:{type:"object",required:["record_id","version_id"],properties:{record_id:{type:"string"},version_id:{type:"string"}}} };
  assert.equal(inferredVerificationDeclaration(write,[write,read]), null);
});

test("commercial customer create has exact result-bound verifier", () => {
  const create = source("lib/commercial/customers/capabilities/createCustomer.js");
  const read = source("lib/commercial/customers/capabilities/readCustomer.js");
  assert.match(create, /commercial\.customers\.read/);
  assert.match(create, /party_id: \["party_id", "customer\.party_id", "customer\.id"\]/);
  assert.match(read, /getCustomer/);
  assert.match(read, /required: \["party_id"\]/);
});
test("commercial send-message verification is exact conversation plus message", () => {
  const send = source("lib/commercial/communications/capabilities/sendDraftMessage.js");
  const read = source("lib/commercial/communications/capabilities/readMessage.js");
  const runtime = source("lib/commercial/runtime/CommercialRuntime.js");
  assert.match(send, /commercial\.communication\.read/);
  assert.match(send, /payload_keys: \["conversation_id", "message_id"\]/);
  assert.match(read, /getMessage/);
  assert.match(read, /required: \["conversation_id", "message_id"\]/);
  assert.match(runtime, /customers:[\s\S]*read:/);
  assert.match(runtime, /communication:[\s\S]*read:/);
});

test("secretary create-like families expose result locators compatible with exact reads", () => {
  const event = source("lib/platform/capabilities/createSecretaryEventCoordinationCapability.js");
  const note = source("lib/platform/capabilities/createSecretaryExecutiveNotesDictationCapability.js");
  const eventRuntime = source("lib/operator/secretary/SecretaryEventCoordinationRuntime.js");
  const noteRuntime = source("lib/operator/secretary/SecretaryExecutiveNotesDictationRuntime.js");
  assert.match(event, /required: \["coordination_id"\]/);
  assert.match(eventRuntime, /coordination_id: coordinationId/);
  assert.match(note, /required: \["note_id"\]/);
  assert.match(noteRuntime, /note_id: noteId/);
});
