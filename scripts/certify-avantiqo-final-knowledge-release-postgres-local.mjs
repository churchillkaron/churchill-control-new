import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const IMAGE = "postgres:17.6-alpine";
const DB = "avantiqo_final_release_cert";
const USER = "postgres";
const PASSWORD = "postgres";
const CONTAINER = `avantiqo-final-release-cert-${process.pid}-${Date.now()}`;
const MIGRATION = "supabase/migrations/20260905065000_atomic_final_knowledge_release.sql";
const FUNCTION_SIG = "public.avantiqo_commit_final_knowledge_release(uuid,uuid,text,timestamptz,uuid,timestamptz,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,timestamptz)";

function run(command, args, { input = null, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout || ""}\n${result.stderr || ""}`);
  }
  return result;
}

function dockerPsql(sql, { allowFailure = false, tuplesOnly = false } = {}) {
  const args = [
    "exec", "-i", CONTAINER,
    "psql", "-U", USER, "-d", DB,
    "-v", "ON_ERROR_STOP=1",
    "-X",
  ];
  if (tuplesOnly) args.push("-A", "-t", "-q");
  args.push("-f", "-");
  return run("docker", args, { input: sql, allowFailure });
}

function dockerPsqlAsync(sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", [
      "exec", "-i", CONTAINER,
      "psql", "-U", USER, "-d", DB,
      "-v", "ON_ERROR_STOP=1", "-X", "-A", "-t", "-q", "-f", "-",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ status: code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function sha64(label) {
  return createHash("sha256").update(label).digest("hex");
}

function uuidFor(caseNo, slot) {
  const tail = String(caseNo * 100 + slot).padStart(12, "0");
  return `00000000-0000-4000-8000-${tail}`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonLiteral(value) {
  const text = JSON.stringify(value).replaceAll("$json$", "$j_s_o_n$");
  return `$json$${text}$json$::jsonb`;
}

function fixture(caseNo, { expired = false } = {}) {
  const org = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
  const authRowId = uuidFor(caseNo, 1);
  const candidateId = uuidFor(caseNo, 2);
  const provisionalId = uuidFor(caseNo, 3);
  const substituteCandidateId = uuidFor(caseNo, 4);
  const substituteProvisionalId = uuidFor(caseNo, 5);
  const consumptionId = uuidFor(caseNo, 6);
  const releaseRowId = uuidFor(caseNo, 7);
  const receiptRowId = uuidFor(caseNo, 8);
  const transactionId = uuidFor(caseNo, 9);
  const authorizationId = sha64(`authorization-${caseNo}`);
  const candidateMac = sha64(`candidate-mac-${caseNo}`);
  const claimDigest = sha64(`claim-digest-${caseNo}`);
  const releaseId = sha64(`release-id-${caseNo}`);
  const releaseBindingDigest = sha64(`release-binding-${caseNo}`);
  const authKey = `final-knowledge-release-authorization:${authorizationId.slice(0, 40)}`;
  const candidateKey = `final-promotion-candidate:${sha64(`candidate-key-${caseNo}`).slice(0, 40)}`;
  const provisionalKey = `provisional:${sha64(`provisional-key-${caseNo}`).slice(0, 40)}`;
  const substituteCandidateKey = `${candidateKey}:substitute`;
  const substituteProvisionalKey = `${provisionalKey}:substitute`;
  const consumptionKey = `final-knowledge-release-authorization-consumed:${authorizationId.slice(0, 40)}`;
  const releaseKey = `released-knowledge:${sha64(`release-key-${caseNo}`).slice(0, 40)}`;
  const receiptKey = `final-knowledge-release-receipt:${sha64(`${org}\0${authorizationId}\0${releaseId}`).slice(0, 40)}`;
  const version = "2026-09-05T08:00:00.000Z";

  const consumptionRow = {
    id: consumptionId,
    organization_id: org,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: "platform_learning_knowledge_release_authorization_consumptions",
    memory_key: consumptionKey,
    memory_type: "completed_step",
    subject: "Final release authorization consumption",
    content: "Synthetic transaction-certification consumption evidence.",
    importance: 1,
    confidence: 1,
    source: "final_knowledge_release_authorization_consumption",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      authorization_id: authorizationId,
      candidate_memory_key: candidateKey,
      provisional_claim_digest: claimDigest,
      replay_allowed: false,
    },
  };

  const releaseRow = {
    id: releaseRowId,
    organization_id: org,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: "platform_knowledge",
    memory_key: releaseKey,
    memory_type: "fact",
    subject: "Synthetic released knowledge",
    content: "Synthetic released knowledge for PostgreSQL atomicity certification only.",
    importance: 0.96,
    confidence: 0.91,
    source: "avantiqo_explicit_final_knowledge_release",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      release_id: releaseId,
      final_release_authorization_id: authorizationId,
      final_release_authorization_one_use_consumed: true,
      final_promotion_candidate_authenticity_verified: true,
      provisional_claim_digest: claimDigest,
      reusable_platform_knowledge: true,
      knowledge_router_reuse_allowed: true,
    },
  };

  const receiptRow = {
    id: receiptRowId,
    organization_id: org,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: "platform_learning_knowledge_release_receipts",
    memory_key: receiptKey,
    memory_type: "completed_step",
    subject: "Immutable final knowledge release receipt",
    content: "Synthetic Ed25519 receipt envelope for PostgreSQL atomicity certification only.",
    importance: 1,
    confidence: 1,
    source: "immutable_final_knowledge_release_receipt",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_V1",
      atomic_binding_contract: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ATOMIC_BINDING_V1",
      status: "COMMITTED",
      receipt_immutable: true,
      receipt_append_only: true,
      transaction_atomic: true,
      partial_release_state_allowed: false,
      transaction_id: transactionId,
      authorization_id: authorizationId,
      authorization_memory_key: authKey,
      authorization_consumption_memory_key: consumptionKey,
      consumption_row_id: consumptionId,
      release_row_id: releaseRowId,
      receipt_row_id: receiptRowId,
      candidate_id: candidateId,
      candidate_memory_key: candidateKey,
      candidate_authenticity_mac: candidateMac,
      provisional_id: provisionalId,
      provisional_claim_memory_key: provisionalKey,
      provisional_claim_digest: claimDigest,
      release_memory_key: releaseKey,
      release_id: releaseId,
      released_knowledge_binding_digest: releaseBindingDigest,
      release_receipt_signature_contract: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_V1",
      release_receipt_signature_algorithm: "Ed25519",
      release_receipt_signature_key_id: "postgres-cert-v1",
      release_receipt_signature: "synthetic-db-boundary-signature-envelope",
      exact_persisted_row_ids_bound: true,
      receipt_mutation_allowed: false,
      replay_allowed: false,
    },
  };

  const candidateFinalMetadata = {
    production_knowledge_release_authorization_id: authorizationId,
    production_knowledge_release_authorization_consumed: true,
    platform_knowledge_written: true,
    release_memory_key: releaseKey,
  };
  const provisionalFinalMetadata = {
    status: "PROMOTED_TO_EXPLICITLY_RELEASED_PLATFORM_KNOWLEDGE",
    released_knowledge_memory_key: releaseKey,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
  };

  return {
    caseNo, org, authRowId, candidateId, provisionalId, substituteCandidateId, substituteProvisionalId,
    consumptionId, releaseRowId, receiptRowId, transactionId, authorizationId, candidateMac, claimDigest,
    authKey, candidateKey, provisionalKey, substituteCandidateKey, substituteProvisionalKey,
    consumptionKey, releaseKey, receiptKey, version, expired,
    consumptionRow, releaseRow, receiptRow, candidateFinalMetadata, provisionalFinalMetadata,
  };
}

function bootstrapSql() {
  return `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.intelligence_conversations (id uuid primary key);
create table public.intelligence_turns (id uuid primary key);
create table public.intelligence_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  party_id uuid,
  entity_id uuid,
  conversation_id uuid references public.intelligence_conversations(id) on delete set null,
  source_turn_id uuid references public.intelligence_turns(id) on delete set null,
  memory_scope text not null,
  memory_key text not null,
  memory_type text not null check (memory_type = any (array['goal','decision','constraint','preference','fact','lesson','completed_step','blocker','relationship']::text[])),
  subject text,
  content text not null,
  importance numeric not null default 0.500 check (importance >= 0 and importance <= 1),
  confidence numeric not null default 1.000 check (confidence >= 0 and confidence <= 1),
  source text not null default 'operator',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  recall_count integer not null default 0 check (recall_count >= 0),
  last_recalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  valid_until timestamptz,
  superseded_by uuid references public.intelligence_memories(id) on delete set null,
  superseded_at timestamptz,
  forgotten_at timestamptz,
  unique (organization_id, memory_scope, memory_key)
);
alter table public.intelligence_memories enable row level security;
grant usage on schema public to service_role, authenticated, anon;
grant select, insert, update, delete on public.intelligence_memories to service_role;

create table public.avantiqo_final_release_test_failpoint (
  stage text primary key
);
grant select on public.avantiqo_final_release_test_failpoint to service_role;

create or replace function public.avantiqo_final_release_test_failpoint_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage text;
begin
  select stage into v_stage from public.avantiqo_final_release_test_failpoint limit 1;
  if v_stage is null then
    return new;
  end if;
  if tg_op = 'INSERT' and new.memory_scope = 'platform_learning_knowledge_release_authorization_consumptions' and v_stage = 'consumption_insert' then
    raise exception 'AVANTIQO_TEST_FAILPOINT_consumption_insert';
  elsif tg_op = 'UPDATE' and old.memory_scope = 'platform_learning_knowledge_release_authorizations' and v_stage = 'authorization_update' then
    raise exception 'AVANTIQO_TEST_FAILPOINT_authorization_update';
  elsif tg_op = 'INSERT' and new.memory_scope = 'platform_knowledge' and v_stage = 'release_insert' then
    raise exception 'AVANTIQO_TEST_FAILPOINT_release_insert';
  elsif tg_op = 'INSERT' and new.memory_scope = 'platform_learning_knowledge_release_receipts' and v_stage = 'receipt_insert' then
    raise exception 'AVANTIQO_TEST_FAILPOINT_receipt_insert';
  elsif tg_op = 'UPDATE' and old.memory_scope = 'platform_learning_knowledge_final_promotion_candidates' and v_stage = 'candidate_update' then
    raise exception 'AVANTIQO_TEST_FAILPOINT_candidate_update';
  elsif tg_op = 'UPDATE' and old.memory_scope = 'platform_provisional_knowledge' and v_stage = 'provisional_update' then
    raise exception 'AVANTIQO_TEST_FAILPOINT_provisional_update';
  end if;
  return new;
end;
$$;

create trigger trg_avantiqo_final_release_test_failpoint
before insert or update on public.intelligence_memories
for each row execute function public.avantiqo_final_release_test_failpoint_guard();
`;
}

function seedSql(f, { preseedDuplicateScope = null } = {}) {
  const validUntil = f.expired ? "transaction_timestamp() - interval '1 minute'" : "transaction_timestamp() + interval '1 day'";
  const duplicate = preseedDuplicateScope === "consumption" ? {
    id: randomUUID(), scope: "platform_learning_knowledge_release_authorization_consumptions", key: f.consumptionKey, type: "completed_step", source: "duplicate_test",
  } : preseedDuplicateScope === "release" ? {
    id: randomUUID(), scope: "platform_knowledge", key: f.releaseKey, type: "fact", source: "duplicate_test",
  } : preseedDuplicateScope === "receipt" ? {
    id: randomUUID(), scope: "platform_learning_knowledge_release_receipts", key: f.receiptKey, type: "completed_step", source: "duplicate_test",
  } : null;
  const duplicateSql = duplicate ? `
insert into public.intelligence_memories (id, organization_id, memory_scope, memory_key, memory_type, subject, content, source, active, metadata, updated_at)
values (${sqlText(duplicate.id)}::uuid, ${sqlText(f.org)}::uuid, ${sqlText(duplicate.scope)}, ${sqlText(duplicate.key)}, ${sqlText(duplicate.type)}, 'duplicate', 'duplicate', ${sqlText(duplicate.source)}, true, '{}'::jsonb, ${sqlText(f.version)}::timestamptz);` : "";
  return `
truncate table public.intelligence_memories;
truncate table public.avantiqo_final_release_test_failpoint;
insert into public.intelligence_memories (
  id, organization_id, memory_scope, memory_key, memory_type, subject, content, source, active, valid_until, metadata, updated_at
) values (
  ${sqlText(f.authRowId)}::uuid, ${sqlText(f.org)}::uuid,
  'platform_learning_knowledge_release_authorizations', ${sqlText(f.authKey)}, 'decision', 'authorization', 'authorization',
  'final_knowledge_release_authorization', true, ${validUntil},
  ${jsonLiteral({
    status: "READY",
    one_use_required: true,
    replay_detection_required: true,
    automatic_release_allowed: false,
    authorization_id: f.authorizationId,
    candidate_memory_key: f.candidateKey,
    candidate_authenticity_mac: f.candidateMac,
    provisional_claim_memory_key: f.provisionalKey,
    provisional_claim_digest: f.claimDigest,
  })}, ${sqlText(f.version)}::timestamptz
);
insert into public.intelligence_memories (
  id, organization_id, memory_scope, memory_key, memory_type, subject, content, source, active, metadata, updated_at
) values
(
  ${sqlText(f.candidateId)}::uuid, ${sqlText(f.org)}::uuid,
  'platform_learning_knowledge_final_promotion_candidates', ${sqlText(f.candidateKey)}, 'decision', 'candidate', 'candidate',
  'final_promotion_candidate', true,
  ${jsonLiteral({ final_promotion_candidate_authenticity_mac: f.candidateMac, provisional_claim_digest: f.claimDigest })},
  ${sqlText(f.version)}::timestamptz
),
(
  ${sqlText(f.provisionalId)}::uuid, ${sqlText(f.org)}::uuid,
  'platform_provisional_knowledge', ${sqlText(f.provisionalKey)}, 'fact', 'provisional', 'provisional',
  'provisional_knowledge', true, '{}'::jsonb, ${sqlText(f.version)}::timestamptz
),
(
  ${sqlText(f.substituteCandidateId)}::uuid, ${sqlText(f.org)}::uuid,
  'platform_learning_knowledge_final_promotion_candidates', ${sqlText(f.substituteCandidateKey)}, 'decision', 'candidate substitute', 'candidate substitute',
  'final_promotion_candidate', true,
  ${jsonLiteral({ final_promotion_candidate_authenticity_mac: sha64(`substitute-candidate-mac-${f.caseNo}`), provisional_claim_digest: f.claimDigest })},
  ${sqlText(f.version)}::timestamptz
),
(
  ${sqlText(f.substituteProvisionalId)}::uuid, ${sqlText(f.org)}::uuid,
  'platform_provisional_knowledge', ${sqlText(f.substituteProvisionalKey)}, 'fact', 'provisional substitute', 'provisional substitute',
  'provisional_knowledge', true, '{}'::jsonb, ${sqlText(f.version)}::timestamptz
);
${duplicateSql}
`;
}

function callSql(f, {
  authorizationExpected = f.version,
  candidateId = f.candidateId,
  candidateExpected = f.version,
  provisionalId = f.provisionalId,
  provisionalExpected = f.version,
  mutateConsumption = null,
  mutateRelease = null,
  mutateReceipt = null,
  setReceiptCommittedAt = true,
  role = "service_role",
} = {}) {
  const consumption = structuredClone(f.consumptionRow);
  const release = structuredClone(f.releaseRow);
  const receipt = structuredClone(f.receiptRow);
  mutateConsumption?.(consumption);
  mutateRelease?.(release);
  mutateReceipt?.(receipt);
  const receiptExpression = setReceiptCommittedAt
    ? `jsonb_set(${jsonLiteral(receipt)}, '{metadata,committed_at}', to_jsonb((select committed_at::text from p)), true)`
    : jsonLiteral(receipt);
  return `
set role ${role};
with p as (select transaction_timestamp() as committed_at)
select public.avantiqo_commit_final_knowledge_release(
  ${sqlText(f.org)}::uuid,
  ${sqlText(f.authRowId)}::uuid,
  ${sqlText(f.authKey)},
  ${sqlText(authorizationExpected)}::timestamptz,
  ${sqlText(candidateId)}::uuid,
  ${sqlText(candidateExpected)}::timestamptz,
  ${sqlText(provisionalId)}::uuid,
  ${sqlText(provisionalExpected)}::timestamptz,
  ${jsonLiteral(consumption)},
  ${jsonLiteral(release)},
  ${jsonLiteral(f.candidateFinalMetadata)},
  ${jsonLiteral(f.provisionalFinalMetadata)},
  ${receiptExpression},
  ${sqlText(f.transactionId)}::uuid,
  (select committed_at from p)
);
`;
}

function assertFailure(result, pattern) {
  assert.notEqual(result.status, 0, `expected SQL failure matching ${pattern}`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}

function scalar(sql) {
  return dockerPsql(sql, { tuplesOnly: true }).stdout.trim();
}

function assertNoPartialRelease(f) {
  const result = scalar(`
select jsonb_build_object(
  'consumption', count(*) filter (where memory_scope='platform_learning_knowledge_release_authorization_consumptions'),
  'release', count(*) filter (where memory_scope='platform_knowledge' and memory_key=${sqlText(f.releaseKey)}),
  'receipt', count(*) filter (where memory_scope='platform_learning_knowledge_release_receipts' and memory_key=${sqlText(f.receiptKey)}),
  'authorization_active', (select active from public.intelligence_memories where id=${sqlText(f.authRowId)}::uuid),
  'candidate_updated_at', (select updated_at::text from public.intelligence_memories where id=${sqlText(f.candidateId)}::uuid),
  'provisional_active', (select active from public.intelligence_memories where id=${sqlText(f.provisionalId)}::uuid),
  'provisional_superseded_by', (select superseded_by from public.intelligence_memories where id=${sqlText(f.provisionalId)}::uuid)
) from public.intelligence_memories;
`);
  const parsed = JSON.parse(result);
  assert.equal(Number(parsed.consumption), 0);
  assert.equal(Number(parsed.release), 0);
  assert.equal(Number(parsed.receipt), 0);
  assert.equal(parsed.authorization_active, true);
  assert.equal(parsed.provisional_active, true);
  assert.equal(parsed.provisional_superseded_by, null);
  assert.match(parsed.candidate_updated_at, /^2026-09-05 08:00:00\+00$/);
}

async function main() {
  assert.equal(fs.existsSync(MIGRATION), true, `missing ${MIGRATION}`);
  const dockerVersion = run("docker", ["version", "--format", "{{.Server.Version}}"], { allowFailure: true });
  assert.equal(dockerVersion.status, 0, "Docker is required for PostgreSQL integration certification");

  run("docker", ["pull", IMAGE]);
  run("docker", [
    "run", "-d", "--rm", "--name", CONTAINER,
    "-e", `POSTGRES_PASSWORD=${PASSWORD}`,
    "-e", `POSTGRES_DB=${DB}`,
    IMAGE,
  ]);

  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const probe = run("docker", [
        "exec", CONTAINER,
        "psql", "-U", USER, "-d", DB,
        "-X", "-A", "-t", "-q", "-c", "select 1;",
      ], { allowFailure: true });
      if (probe.status === 0 && probe.stdout.trim() === "1") {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(ready, true, "PostgreSQL 17 certification target database did not become query-ready");

    const serverVersion = scalar("show server_version;");
    assert.match(serverVersion, /^17\.6(?:\.|$)/);

    dockerPsql(bootstrapSql());
    dockerPsql(fs.readFileSync(MIGRATION, "utf8"));

    const permissionState = JSON.parse(scalar(`
select jsonb_build_object(
  'authenticated_execute', has_function_privilege('authenticated', ${sqlText(FUNCTION_SIG)}, 'EXECUTE'),
  'anon_execute', has_function_privilege('anon', ${sqlText(FUNCTION_SIG)}, 'EXECUTE'),
  'service_role_execute', has_function_privilege('service_role', ${sqlText(FUNCTION_SIG)}, 'EXECUTE'),
  'service_role_bypassrls', (select rolbypassrls from pg_roles where rolname='service_role'),
  'table_rls', (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='intelligence_memories')
);
`));
    assert.deepEqual(permissionState, {
      authenticated_execute: false,
      anon_execute: false,
      service_role_execute: true,
      service_role_bypassrls: true,
      table_rls: true,
    });

    const happy = fixture(1);
    dockerPsql(seedSql(happy));
    const success = dockerPsql(callSql(happy), { tuplesOnly: true });
    assert.match(success.stdout, /"transaction_atomic": true/);
    const successState = JSON.parse(scalar(`
select jsonb_build_object(
  'authorization_active', (select active from public.intelligence_memories where id=${sqlText(happy.authRowId)}::uuid),
  'authorization_status', (select metadata->>'status' from public.intelligence_memories where id=${sqlText(happy.authRowId)}::uuid),
  'candidate_finalized', (select metadata->>'platform_knowledge_written' from public.intelligence_memories where id=${sqlText(happy.candidateId)}::uuid),
  'provisional_active', (select active from public.intelligence_memories where id=${sqlText(happy.provisionalId)}::uuid),
  'release_count', count(*) filter (where memory_scope='platform_knowledge' and memory_key=${sqlText(happy.releaseKey)}),
  'receipt_count', count(*) filter (where memory_scope='platform_learning_knowledge_release_receipts' and memory_key=${sqlText(happy.receiptKey)}),
  'consumption_count', count(*) filter (where memory_scope='platform_learning_knowledge_release_authorization_consumptions' and memory_key=${sqlText(happy.consumptionKey)})
) from public.intelligence_memories;
`));
    assert.equal(successState.authorization_active, false);
    assert.equal(successState.authorization_status, "CONSUMED");
    assert.equal(successState.candidate_finalized, "true");
    assert.equal(successState.provisional_active, false);
    assert.equal(Number(successState.release_count), 1);
    assert.equal(Number(successState.receipt_count), 1);
    assert.equal(Number(successState.consumption_count), 1);

    const receiptUpdate = dockerPsql(`update public.intelligence_memories set content='tampered' where id=${sqlText(happy.receiptRowId)}::uuid;`, { allowFailure: true });
    assertFailure(receiptUpdate, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_IMMUTABLE/);
    const receiptDelete = dockerPsql(`delete from public.intelligence_memories where id=${sqlText(happy.receiptRowId)}::uuid;`, { allowFailure: true });
    assertFailure(receiptDelete, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_IMMUTABLE/);

    const replay = dockerPsql(callSql(happy), { allowFailure: true });
    assertFailure(replay, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_STATE_CONFLICT/);
    assert.equal(scalar(`select count(*) from public.intelligence_memories where memory_key in (${sqlText(happy.consumptionKey)},${sqlText(happy.releaseKey)},${sqlText(happy.receiptKey)});`), "3");

    const expired = fixture(2, { expired: true });
    dockerPsql(seedSql(expired));
    assertFailure(dockerPsql(callSql(expired), { allowFailure: true }), /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_EXPIRED/);
    assertNoPartialRelease(expired);

    for (const [caseNo, override, pattern] of [
      [3, { authorizationExpected: "2026-09-05T07:59:59.000Z" }, /AUTHORIZATION_STATE_CONFLICT/],
      [4, { candidateExpected: "2026-09-05T07:59:59.000Z" }, /CANDIDATE_STATE_CONFLICT/],
      [5, { provisionalExpected: "2026-09-05T07:59:59.000Z" }, /PROVISIONAL_STATE_CONFLICT/],
    ]) {
      const f = fixture(caseNo);
      dockerPsql(seedSql(f));
      assertFailure(dockerPsql(callSql(f, override), { allowFailure: true }), pattern);
      assertNoPartialRelease(f);
    }

    const substitutionCases = [
      [6, { candidateId: null }, /AUTHORIZATION_CANDIDATE_BINDING_MISMATCH/, (f, o) => { o.candidateId = f.substituteCandidateId; }],
      [7, { provisionalId: null }, /AUTHORIZATION_CANDIDATE_BINDING_MISMATCH/, (f, o) => { o.provisionalId = f.substituteProvisionalId; }],
      [8, { mutateRelease: (row) => { row.metadata.final_release_authorization_id = sha64("substituted-authorization"); } }, /RELEASE_ROW_INVALID/],
      [9, { mutateReceipt: (row) => { row.metadata.release_row_id = randomUUID(); } }, /IMMUTABLE_RECEIPT_INVALID/],
    ];
    for (const [caseNo, baseOverride, pattern, prepare] of substitutionCases) {
      const f = fixture(caseNo);
      const override = { ...baseOverride };
      prepare?.(f, override);
      dockerPsql(seedSql(f));
      assertFailure(dockerPsql(callSql(f, override), { allowFailure: true }), pattern);
      assertNoPartialRelease(f);
    }

    const missingReceiptCommittedAt = fixture(13);
    dockerPsql(seedSql(missingReceiptCommittedAt));
    assertFailure(
      dockerPsql(callSql(missingReceiptCommittedAt, { setReceiptCommittedAt: false }), { allowFailure: true }),
      /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_IMMUTABLE_RECEIPT_INVALID/,
    );
    assertNoPartialRelease(missingReceiptCommittedAt);

    const nonHexBindingDigest = fixture(14);
    dockerPsql(seedSql(nonHexBindingDigest));
    assertFailure(
      dockerPsql(callSql(nonHexBindingDigest, {
        mutateReceipt: (row) => { row.metadata.released_knowledge_binding_digest = "g".repeat(64); },
      }), { allowFailure: true }),
      /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_IMMUTABLE_RECEIPT_INVALID/,
    );
    assertNoPartialRelease(nonHexBindingDigest);

    const uppercaseBindingDigest = fixture(15);
    dockerPsql(seedSql(uppercaseBindingDigest));
    assertFailure(
      dockerPsql(callSql(uppercaseBindingDigest, {
        mutateReceipt: (row) => { row.metadata.released_knowledge_binding_digest = "A".repeat(64); },
      }), { allowFailure: true }),
      /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_IMMUTABLE_RECEIPT_INVALID/,
    );
    assertNoPartialRelease(uppercaseBindingDigest);

    for (const [caseNo, scope] of [[10, "consumption"], [11, "release"], [12, "receipt"]]) {
      const f = fixture(caseNo);
      dockerPsql(seedSql(f, { preseedDuplicateScope: scope }));
      const result = dockerPsql(callSql(f), { allowFailure: true });
      assertFailure(result, /duplicate key value violates unique constraint/);
      const state = JSON.parse(scalar(`
select jsonb_build_object(
  'authorization_active', (select active from public.intelligence_memories where id=${sqlText(f.authRowId)}::uuid),
  'candidate_version_unchanged', (select updated_at=${sqlText(f.version)}::timestamptz from public.intelligence_memories where id=${sqlText(f.candidateId)}::uuid),
  'provisional_active', (select active from public.intelligence_memories where id=${sqlText(f.provisionalId)}::uuid),
  'nonduplicate_consumption', count(*) filter (where id=${sqlText(f.consumptionId)}::uuid),
  'nonduplicate_release', count(*) filter (where id=${sqlText(f.releaseRowId)}::uuid),
  'nonduplicate_receipt', count(*) filter (where id=${sqlText(f.receiptRowId)}::uuid)
) from public.intelligence_memories;
`));
      assert.equal(state.authorization_active, true);
      assert.equal(state.candidate_version_unchanged, true);
      assert.equal(state.provisional_active, true);
      assert.equal(Number(state.nonduplicate_consumption), 0);
      assert.equal(Number(state.nonduplicate_release), 0);
      assert.equal(Number(state.nonduplicate_receipt), 0);
    }

    const stages = ["consumption_insert", "authorization_update", "release_insert", "receipt_insert", "candidate_update", "provisional_update"];
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      const f = fixture(20 + index);
      dockerPsql(seedSql(f));
      dockerPsql(`insert into public.avantiqo_final_release_test_failpoint(stage) values (${sqlText(stage)});`);
      const result = dockerPsql(callSql(f), { allowFailure: true });
      assertFailure(result, new RegExp(`AVANTIQO_TEST_FAILPOINT_${stage}`));
      dockerPsql("truncate table public.avantiqo_final_release_test_failpoint;");
      assertNoPartialRelease(f);
    }

    const concurrent = fixture(40);
    dockerPsql(seedSql(concurrent));
    const [left, right] = await Promise.all([dockerPsqlAsync(callSql(concurrent)), dockerPsqlAsync(callSql(concurrent))]);
    const winners = [left, right].filter((r) => r.status === 0);
    const losers = [left, right].filter((r) => r.status !== 0);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.match(`${losers[0].stdout}\n${losers[0].stderr}`, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_STATE_CONFLICT/);
    const concurrentState = JSON.parse(scalar(`
select jsonb_build_object(
  'consumption', count(*) filter (where id=${sqlText(concurrent.consumptionId)}::uuid),
  'release', count(*) filter (where id=${sqlText(concurrent.releaseRowId)}::uuid),
  'receipt', count(*) filter (where id=${sqlText(concurrent.receiptRowId)}::uuid),
  'authorization_active', (select active from public.intelligence_memories where id=${sqlText(concurrent.authRowId)}::uuid),
  'provisional_active', (select active from public.intelligence_memories where id=${sqlText(concurrent.provisionalId)}::uuid)
) from public.intelligence_memories;
`));
    assert.equal(Number(concurrentState.consumption), 1);
    assert.equal(Number(concurrentState.release), 1);
    assert.equal(Number(concurrentState.receipt), 1);
    assert.equal(concurrentState.authorization_active, false);
    assert.equal(concurrentState.provisional_active, false);

    console.log(JSON.stringify({
      success: true,
      status: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_POSTGRES_TRANSACTION_CERTIFIED",
      postgres_version: serverVersion,
      image: IMAGE,
      production_database_touched: false,
      verified: {
        exact_migration_executed_on_postgresql_17_6: true,
        production_rls_and_service_role_shape_reproduced: true,
        service_role_only_function_execution: true,
        target_database_query_readiness_probe: true,
        happy_path_atomic_commit: true,
        immutable_receipt_update_delete_rejected: true,
        missing_receipt_committed_at_rejected: true,
        non_hex_release_binding_digest_rejected: true,
        uppercase_release_binding_digest_rejected: true,
        replay_rejected: true,
        expired_authorization_rejected: true,
        stale_authorization_candidate_provisional_versions_rejected: true,
        candidate_provisional_release_receipt_substitution_rejected: true,
        duplicate_consumption_release_receipt_keys_rollback: true,
        rollback_proven_after_every_mutation_stage: true,
        concurrent_release_exactly_one_winner: true,
        receipt_present_if_and_only_if_release_committed: true,
      },
    }, null, 2));
  } finally {
    run("docker", ["rm", "-f", CONTAINER], { allowFailure: true });
  }
}

await main();
