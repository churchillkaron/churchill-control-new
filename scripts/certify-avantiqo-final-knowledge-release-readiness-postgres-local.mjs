import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const IMAGE = "postgres:17.6-alpine";
const DB = "avantiqo_final_release_readiness_cert";
const USER = "postgres";
const PASSWORD = "postgres";
const CONTAINER = `avantiqo-final-release-readiness-${process.pid}-${Date.now()}`;
const ATOMIC_MIGRATION = "supabase/migrations/20260905065000_atomic_final_knowledge_release.sql";
const READINESS_MIGRATION = "supabase/migrations/20260905114500_final_knowledge_release_activation_readiness.sql";
const ATOMIC_SIG = "public.avantiqo_commit_final_knowledge_release(uuid,uuid,text,timestamptz,uuid,timestamptz,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,timestamptz)";
const READINESS_SIG = "public.avantiqo_final_knowledge_release_activation_readiness()";

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

function dockerPsql(sql, { role = null, tuplesOnly = true, allowFailure = false } = {}) {
  const prefix = role ? `set role ${role};\n` : "";
  const args = ["exec", "-i", CONTAINER, "psql", "-U", USER, "-d", DB, "-v", "ON_ERROR_STOP=1", "-X"];
  if (tuplesOnly) args.push("-A", "-t", "-q");
  args.push("-f", "-");
  return run("docker", args, { input: `${prefix}${sql}`, allowFailure });
}

function scalar(sql, options = {}) {
  return dockerPsql(sql, options).stdout.trim();
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
`;
}

function readiness() {
  return JSON.parse(scalar("select public.avantiqo_final_knowledge_release_activation_readiness();", { role: "service_role" }));
}

function assertReady(value) {
  assert.equal(value.contract, "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_DATABASE_READINESS_V1");
  assert.equal(value.ready, true);
  assert.equal(value.atomic_release_rpc_present, true);
  assert.equal(value.atomic_release_security_invoker, true);
  assert.equal(value.service_role_execute, true);
  assert.equal(value.anon_execute, false);
  assert.equal(value.authenticated_execute, false);
  assert.equal(value.receipt_mutation_guard_present, true);
  assert.equal(value.receipt_guard_security_invoker, true);
  assert.equal(value.receipt_immutable_trigger_present, true);
  assert.equal(value.intelligence_memories_rls, true);
  assert.equal(value.secret_material_returned, false);
}

async function main() {
  assert.equal(fs.existsSync(ATOMIC_MIGRATION), true);
  assert.equal(fs.existsSync(READINESS_MIGRATION), true);
  assert.equal(run("docker", ["version", "--format", "{{.Server.Version}}"], { allowFailure: true }).status, 0);

  run("docker", ["pull", IMAGE]);
  run("docker", [
    "run", "-d", "--rm", "--name", CONTAINER,
    "-e", `POSTGRES_PASSWORD=${PASSWORD}`,
    "-e", `POSTGRES_DB=${DB}`,
    IMAGE,
  ]);

  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const probe = dockerPsql("select 1;", { allowFailure: true });
      if (probe.status === 0 && probe.stdout.trim() === "1") {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(ready, true, "PostgreSQL certification database did not become query-ready");
    assert.match(scalar("show server_version;"), /^17\.6(?:\.|$)/);

    dockerPsql(bootstrapSql(), { tuplesOnly: false });
    dockerPsql(fs.readFileSync(ATOMIC_MIGRATION, "utf8"), { tuplesOnly: false });
    dockerPsql(fs.readFileSync(READINESS_MIGRATION, "utf8"), { tuplesOnly: false });

    const privileges = JSON.parse(scalar(`
select jsonb_build_object(
  'service_role', has_function_privilege('service_role', '${READINESS_SIG}', 'EXECUTE'),
  'anon', has_function_privilege('anon', '${READINESS_SIG}', 'EXECUTE'),
  'authenticated', has_function_privilege('authenticated', '${READINESS_SIG}', 'EXECUTE')
);
`));
    assert.deepEqual(privileges, { service_role: true, anon: false, authenticated: false });
    assertReady(readiness());

    const anonCall = dockerPsql("select public.avantiqo_final_knowledge_release_activation_readiness();", { role: "anon", allowFailure: true });
    assert.notEqual(anonCall.status, 0);
    assert.match(`${anonCall.stdout}\n${anonCall.stderr}`, /permission denied for function avantiqo_final_knowledge_release_activation_readiness/);

    dockerPsql(`revoke execute on function ${ATOMIC_SIG} from service_role;`, { tuplesOnly: false });
    let state = readiness();
    assert.equal(state.ready, false);
    assert.equal(state.service_role_execute, false);
    dockerPsql(`grant execute on function ${ATOMIC_SIG} to service_role;`, { tuplesOnly: false });
    assertReady(readiness());

    dockerPsql(`grant execute on function ${ATOMIC_SIG} to anon;`, { tuplesOnly: false });
    state = readiness();
    assert.equal(state.ready, false);
    assert.equal(state.anon_execute, true);
    dockerPsql(`revoke execute on function ${ATOMIC_SIG} from anon;`, { tuplesOnly: false });
    assertReady(readiness());

    dockerPsql("drop trigger trg_avantiqo_final_knowledge_release_receipt_immutable on public.intelligence_memories;", { tuplesOnly: false });
    state = readiness();
    assert.equal(state.ready, false);
    assert.equal(state.receipt_immutable_trigger_present, false);
    dockerPsql(`
create trigger trg_avantiqo_final_knowledge_release_receipt_immutable
before update or delete on public.intelligence_memories
for each row
when (old.memory_scope = 'platform_learning_knowledge_release_receipts')
execute function public.avantiqo_block_final_knowledge_release_receipt_mutation();
`, { tuplesOnly: false });
    assertReady(readiness());

    dockerPsql("alter table public.intelligence_memories disable row level security;", { tuplesOnly: false });
    state = readiness();
    assert.equal(state.ready, false);
    assert.equal(state.intelligence_memories_rls, false);
    dockerPsql("alter table public.intelligence_memories enable row level security;", { tuplesOnly: false });
    assertReady(readiness());

    console.log(JSON.stringify({
      success: true,
      status: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ACTIVATION_READINESS_POSTGRES_CERTIFIED",
      postgres_version: scalar("show server_version;"),
      image: IMAGE,
      production_database_touched: false,
      verified: {
        readiness_rpc_service_role_only: true,
        exact_atomic_boundary_required: true,
        security_invoker_required: true,
        anon_and_authenticated_atomic_execute_rejected: true,
        immutable_receipt_trigger_required: true,
        intelligence_memories_rls_required: true,
        secret_material_returned: false,
        fail_closed_when_any_required_database_control_is_weakened: true,
      },
    }, null, 2));
  } finally {
    run("docker", ["rm", "-f", CONTAINER], { allowFailure: true });
  }
}

await main();
