-- Durable, non-promotable receipts for Node 01 idle learning evaluation.
create table if not exists public.avantiqo_local_learning_evaluations (
  id uuid primary key default gen_random_uuid(),
  node_id text not null references public.avantiqo_local_compute_nodes(id) on delete restrict,
  agenda_id uuid not null references public.intelligence_memories(id) on delete restrict,
  agenda_updated_at timestamptz not null,
  contract text not null,
  topic_key text,
  knowledge_domain text,
  evaluation jsonb not null,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint avantiqo_local_learning_eval_contract check (contract = 'AVANTIQO_NODE01_IDLE_LEARNING_EVAL_V2'),
  constraint avantiqo_local_learning_eval_size check (octet_length(evaluation::text) <= 32768),
  constraint avantiqo_local_learning_eval_no_authority check (
    coalesce((evaluation ->> 'promotion_authorized')::boolean, false) = false
    and coalesce((evaluation ->> 'mutation_authority')::boolean, false) = false
  ),
  unique (agenda_id, agenda_updated_at, contract)
);
alter table public.avantiqo_local_learning_evaluations enable row level security;
revoke all on table public.avantiqo_local_learning_evaluations from anon, authenticated;
grant select on table public.avantiqo_local_learning_evaluations to service_role;

create index if not exists avantiqo_local_learning_evaluations_recent_idx
  on public.avantiqo_local_learning_evaluations (evaluated_at desc);

create or replace function public.record_avantiqo_local_learning_evaluation(
  p_node_id text,
  p_node_token text,
  p_agenda_id uuid,
  p_agenda_updated_at timestamptz,
  p_contract text,
  p_topic_key text,
  p_knowledge_domain text,
  p_evaluation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agenda public.intelligence_memories%rowtype;
  v_id uuid;
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;
  if p_contract <> 'AVANTIQO_NODE01_IDLE_LEARNING_EVAL_V2' then
    raise exception 'AVANTIQO_LOCAL_LEARNING_EVAL_CONTRACT_INVALID';
  end if;
  if octet_length(coalesce(p_evaluation, '{}'::jsonb)::text) > 32768 then
    raise exception 'AVANTIQO_LOCAL_LEARNING_EVAL_TOO_LARGE';
  end if;
  if coalesce(p_evaluation ->> 'status', '') <> 'EVALUATED'
     or coalesce((p_evaluation ->> 'promotion_authorized')::boolean, true) <> false
     or coalesce((p_evaluation ->> 'mutation_authority')::boolean, true) <> false
     or coalesce((p_evaluation #>> '{safeguards,fresh_evidence_required}')::boolean, false) <> true
     or coalesce((p_evaluation #>> '{safeguards,current_authority_required}')::boolean, false) <> true
     or coalesce((p_evaluation #>> '{safeguards,independent_verification_required}')::boolean, false) <> true then
    raise exception 'AVANTIQO_LOCAL_LEARNING_EVAL_SAFEGUARDS_INVALID';
  end if;

  select * into v_agenda from public.intelligence_memories m
  where m.id = p_agenda_id
    and m.updated_at = p_agenda_updated_at
    and m.active = true
    and m.memory_scope = 'platform_learning_agenda'
    and m.party_id is null and m.entity_id is null and m.conversation_id is null and m.source_turn_id is null
    and m.forgotten_at is null and m.superseded_at is null;
  if v_agenda.id is null then
    raise exception 'AVANTIQO_LOCAL_LEARNING_AGENDA_REVISION_INVALID';
  end if;

  insert into public.avantiqo_local_learning_evaluations (
    node_id, agenda_id, agenda_updated_at, contract, topic_key, knowledge_domain, evaluation
  ) values (
    btrim(p_node_id), p_agenda_id, p_agenda_updated_at, p_contract,
    left(coalesce(p_topic_key, ''), 300), left(coalesce(p_knowledge_domain, ''), 120), p_evaluation
  ) on conflict (agenda_id, agenda_updated_at, contract) do nothing
  returning id into v_id;

  return jsonb_build_object('recorded', v_id is not null, 'receipt_id', v_id, 'promotion_authorized', false, 'mutation_authority', false);
end;
$$;
revoke all on function public.record_avantiqo_local_learning_evaluation(text,text,uuid,timestamptz,text,text,text,jsonb) from public;
grant execute on function public.record_avantiqo_local_learning_evaluation(text,text,uuid,timestamptz,text,text,text,jsonb) to anon, authenticated, service_role;

create or replace function public.read_avantiqo_local_learning_eval_candidate(
  p_node_id text,
  p_node_token text,
  p_offset integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_org_count integer;
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 32));
  v_row public.intelligence_memories%rowtype;
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED'; end if;
  select count(distinct m.organization_id), min(m.organization_id::text)::uuid into v_org_count, v_org_id
  from public.intelligence_memories m
  where m.memory_scope='platform_learning_agenda' and m.active=true and m.forgotten_at is null
    and m.party_id is null and m.entity_id is null and m.conversation_id is null and m.source_turn_id is null;
  if v_org_count <> 1 or v_org_id is null then raise exception 'AVANTIQO_LOCAL_LEARNING_PLATFORM_ORG_INVALID'; end if;

  select m.* into v_row
  from public.intelligence_memories m
  where m.organization_id=v_org_id and m.active=true and m.memory_scope='platform_learning_agenda'
    and m.party_id is null and m.entity_id is null and m.conversation_id is null and m.source_turn_id is null
    and m.forgotten_at is null and m.superseded_at is null
    and upper(coalesce(m.metadata ->> 'status','')) in ('READY','ERROR')
    and (nullif(m.metadata ->> 'next_research_at','') is null or (m.metadata ->> 'next_research_at')::timestamptz <= now())
    and not exists (
      select 1 from public.avantiqo_local_learning_evaluations e
      where e.agenda_id=m.id and e.agenda_updated_at=m.updated_at and e.contract='AVANTIQO_NODE01_IDLE_LEARNING_EVAL_V2'
    )
  order by case when upper(coalesce(m.metadata ->> 'status',''))='READY' then 0 else 1 end,
    m.importance desc nulls last, coalesce((m.metadata ->> 'next_research_at')::timestamptz,m.updated_at) asc, m.updated_at asc
  offset v_offset limit 1;

  if v_row.id is null then return jsonb_build_object('available',false,'contract','AVANTIQO_NODE01_LEARNING_EVAL_CANDIDATE_V2','offset',v_offset); end if;
  return jsonb_build_object(
    'available',true,'contract','AVANTIQO_NODE01_LEARNING_EVAL_CANDIDATE_V2','offset',v_offset,
    'agenda_id',v_row.id,'agenda_updated_at',v_row.updated_at,'memory_key',v_row.memory_key,
    'subject',left(coalesce(v_row.subject,''),500),'importance',v_row.importance,'confidence',v_row.confidence,
    'topic_key',left(coalesce(v_row.metadata ->> 'topic_key',''),300),
    'knowledge_domain',left(coalesce(v_row.metadata ->> 'knowledge_domain',''),120),
    'jurisdiction',left(coalesce(v_row.metadata ->> 'jurisdiction',''),120),
    'freshness_days',case when coalesce(v_row.metadata ->> 'freshness_days','') ~ '^[0-9]+$' then (v_row.metadata ->> 'freshness_days')::integer else null end,
    'source_count',case when coalesce(v_row.metadata ->> 'last_source_count',v_row.metadata ->> 'source_count','') ~ '^[0-9]+$' then coalesce(v_row.metadata ->> 'last_source_count',v_row.metadata ->> 'source_count')::integer else 0 end,
    'claim_count',case when coalesce(v_row.metadata ->> 'last_claim_count',v_row.metadata ->> 'claim_count','') ~ '^[0-9]+$' then coalesce(v_row.metadata ->> 'last_claim_count',v_row.metadata ->> 'claim_count')::integer else 0 end,
    'uncertainty_count',case when coalesce(v_row.metadata ->> 'last_uncertainty_count',v_row.metadata ->> 'uncertainty_count','') ~ '^[0-9]+$' then coalesce(v_row.metadata ->> 'last_uncertainty_count',v_row.metadata ->> 'uncertainty_count')::integer else 0 end,
    'agenda_status',left(coalesce(v_row.metadata ->> 'status',''),40),'next_research_at',v_row.metadata ->> 'next_research_at',
    'failure_count',case when coalesce(v_row.metadata ->> 'failure_count','') ~ '^[0-9]+$' then (v_row.metadata ->> 'failure_count')::integer else 0 end,
    'customer_private_content_included',false,'mutation_authority',false,'promotion_authority',false
  );
end;
$$;
revoke all on function public.read_avantiqo_local_learning_eval_candidate(text,text,integer) from public;
grant execute on function public.read_avantiqo_local_learning_eval_candidate(text,text,integer) to anon, authenticated, service_role;
