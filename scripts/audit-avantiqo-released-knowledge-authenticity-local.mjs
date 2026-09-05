import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
  createAvantiqoReleasedKnowledgeAuthenticityVerifier,
  sealAvantiqoReleasedKnowledgeAuthenticity,
} from "../lib/intelligence/runtime/AvantiqoReleasedKnowledgeAuthenticityRuntime.js";

const ACTIVE = "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID";
const KEYRING = "AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON";
const OLD_ENV = { active: process.env[ACTIVE], keyring: process.env[KEYRING] };
const K1 = "11".repeat(32);
const K2 = "22".repeat(32);

function configure(active = "release-v1", keys = { "release-v1": K1 }) {
  process.env[ACTIVE] = active;
  process.env[KEYRING] = JSON.stringify(keys);
}

function clone(value) {
  return structuredClone(value);
}

function baseRow() {
  return {
    organization_id: "org-a",
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: "platform_knowledge",
    memory_key: "released-knowledge:abc123",
    memory_type: "knowledge",
    subject: "governed learned claim",
    content: "A released claim that passed the governed evidence and benchmark path.",
    importance: 0.9,
    confidence: 0.98,
    source: "avantiqo_explicit_final_knowledge_release",
    active: true,
    valid_until: "2026-12-01T00:00:00.000Z",
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_V1",
      release_id: "release-abc123",
      release_status: "RELEASED_MONITORED",
      explicit_final_release_approved: true,
      reusable_platform_knowledge: true,
      knowledge_router_reuse_allowed: true,
      released_knowledge_authenticity_required: true,
      released_knowledge_authenticity_contract:
        AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
      unsigned_legacy_release_compatibility_allowed: false,
      hypothesis_fingerprint: "a".repeat(64),
    },
    updated_at: "2026-09-05T05:00:00.000Z",
    created_at: "2026-09-05T04:00:00.000Z",
  };
}

try {
  configure();
  const sealed = sealAvantiqoReleasedKnowledgeAuthenticity(baseRow());
  assert.equal(sealed.success, true);
  assert.equal(sealed.status, "RELEASED_KNOWLEDGE_AUTHENTICITY_SEALED");
  const verifier = createAvantiqoReleasedKnowledgeAuthenticityVerifier();
  assert.equal(verifier.available, true);
  assert.equal(verifier.verify(sealed.row), true);

  const mutations = [
    ["content", (row) => { row.content += " forged"; }],
    ["organization", (row) => { row.organization_id = "org-b"; }],
    ["scope", (row) => { row.memory_scope = "platform_evidence_graph"; }],
    ["key", (row) => { row.memory_key = "released-knowledge:other"; }],
    ["type", (row) => { row.memory_type = "preference"; }],
    ["subject", (row) => { row.subject = "changed subject"; }],
    ["source", (row) => { row.source = "database_only_writer"; }],
    ["active", (row) => { row.active = false; }],
    ["valid_until", (row) => { row.valid_until = "2099-01-01T00:00:00.000Z"; }],
    ["importance", (row) => { row.importance = 1; }],
    ["confidence", (row) => { row.confidence = 1; }],
    ["release_status", (row) => { row.metadata.release_status = "RELEASED_UNMONITORED"; }],
    ["router_reuse", (row) => { row.metadata.knowledge_router_reuse_allowed = false; }],
    ["approval", (row) => { row.metadata.explicit_final_release_approved = false; }],
    ["release_id", (row) => { row.metadata.release_id = "release-forged"; }],
  ];
  for (const [name, mutate] of mutations) {
    const row = clone(sealed.row);
    mutate(row);
    assert.equal(verifier.verify(row), false, `mutation must fail: ${name}`);
  }

  const unsigned = baseRow();
  assert.equal(verifier.verify(unsigned), false);
  const malformed = clone(sealed.row);
  malformed.metadata.released_knowledge_authenticity_mac = "bad";
  assert.equal(verifier.verify(malformed), false);
  const unknown = clone(sealed.row);
  unknown.metadata.released_knowledge_authenticity_key_id = "unknown-key";
  assert.equal(verifier.verify(unknown), false);
  const replay = clone(sealed.row);
  replay.metadata.released_knowledge_authenticity_mac = "33".repeat(32);
  assert.equal(verifier.verify(replay), false);

  configure("release-v2", { "release-v1": K1, "release-v2": K2 });
  const rotatedVerifier = createAvantiqoReleasedKnowledgeAuthenticityVerifier();
  assert.equal(rotatedVerifier.verify(sealed.row), true, "retained old key must verify");
  const rotatedSeal = sealAvantiqoReleasedKnowledgeAuthenticity(baseRow());
  assert.equal(rotatedSeal.success, true);
  assert.equal(rotatedSeal.key_id, "release-v2");
  assert.equal(rotatedVerifier.verify(rotatedSeal.row), true);

  configure("release-v2", { "release-v2": K2 });
  const retiredVerifier = createAvantiqoReleasedKnowledgeAuthenticityVerifier();
  assert.equal(retiredVerifier.verify(sealed.row), false, "retired key must fail");
  assert.equal(retiredVerifier.verify(rotatedSeal.row), true);

  const finalRelease = fs.readFileSync(
    "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js",
    "utf8",
  );
  const retrieval = fs.readFileSync(
    "lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js",
    "utf8",
  );
  const lifecycle = fs.readFileSync(
    "lib/intelligence/runtime/AvantiqoReleasedKnowledgeLifecycleRuntime.js",
    "utf8",
  );

  assert.match(finalRelease, /sealAvantiqoReleasedKnowledgeAuthenticity\(releaseDraft\)/);
  assert.match(finalRelease, /EXISTING_RELEASE_AUTHENTICITY_REQUIRED/);
  assert.match(finalRelease, /RELEASED_KNOWLEDGE_AUTHENTICITY_INVALID/);
  assert.match(finalRelease, /released_knowledge_authenticity_resealed_after_revalidation/);
  assert.match(retrieval, /createAvantiqoReleasedKnowledgeAuthenticityVerifier\(\)/);
  assert.match(retrieval, /RELEASED_KNOWLEDGE_AUTHENTICITY_INVALID/);
  assert.match(retrieval, /unsigned_legacy_release_compatibility_allowed: false/);
  assert.match(lifecycle, /ttl_renewal_requires_valid_released_knowledge_authenticity: true/);
  assert.match(lifecycle, /sealAvantiqoReleasedKnowledgeAuthenticity/);
  assert.match(lifecycle, /unsigned_legacy_release_renewal_allowed: false/);

  console.log("AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CERTIFIED");
} finally {
  if (OLD_ENV.active === undefined) delete process.env[ACTIVE];
  else process.env[ACTIVE] = OLD_ENV.active;
  if (OLD_ENV.keyring === undefined) delete process.env[KEYRING];
  else process.env[KEYRING] = OLD_ENV.keyring;
}
