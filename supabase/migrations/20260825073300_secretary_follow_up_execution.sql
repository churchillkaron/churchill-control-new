begin;

create table if not exists public.secretary_follow_up_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  follow_up_id uuid not null references public.secretary_follow_ups(id) on delete cascade,
  contact_party_id uuid null,
  action_type text not null check (action_type in ('CALL','MESSAGE','EMAIL')),
  instruction text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','QUEUED','COMPLETED','FAILED','SKIPPED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 4 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  conversation_id uuid null references public.communication_conversations(id) on delete set null,
  message_id uuid null references public.communication_messages(id) on delete set null,
  outbound_call_request_id uuid null references public.secretary_outbound_call_requests(id) on delete set null,
  completed_at timestamptz null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_follow_up_execution_contact_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  unique (organization_id, follow_up_id)
);

create index if not exists secretary_follow_up_executions_claim_idx
  on public.secretary_follow_up_executions (status, available_at, created_at)
  where status in ('PENDING','FAILED');

alter table public.secretary_follow_up_executions enable row level security;
revoke all on public.secretary_follow_up_executions from anon, authenticated;
grant select, insert, update, delete on public.secretary_follow_up_executions to service_role;

create unique index if not exists communication_messages_secretary_follow_up_execution_uidx
  on public.communication_messages ((metadata->>'secretary_follow_up_execution_id'))
  where direction = 'OUTBOUND'
    and metadata ? 'secretary_follow_up_execution_id';

create unique index if not exists secretary_outbound_call_follow_up_execution_uidx
  on public.secretary_outbound_call_requests ((metadata->>'secretary_follow_up_execution_id'))
  where metadata ? 'secretary_follow_up_execution_id';

create or replace function public.secretary_materialize_due_follow_up_executions(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_created integer := 0;
begin
  insert into public.secretary_follow_up_executions (
    organization_id,
    follow_up_id,
    contact_party_id,
    action_type,
    instruction,
    available_at,
    metadata
  )
  select
    f.organization_id,
    f.id,
    f.contact_party_id,
    f.action_type,
    nullif(btrim(coalesce(f.metadata->>'execution_instruction', f.reason)), ''),
    greatest(f.due_at, p_now),
    jsonb_build_object(
      'execution_owner', 'SECRETARY',
      'execution_ready', true,
      'commitment_extraction_id', f.metadata->>'commitment_extraction_id',
      'commitment_extraction_item_key', f.metadata->>'commitment_extraction_item_key',
      'source_follow_up_reason', f.reason,
      'external_authority_used', false
    )
  from public.secretary_follow_ups f
  where f.status = 'PENDING'
    and f.due_at <= p_now
    and upper(coalesce(f.metadata->>'execution_owner', '')) = 'SECRETARY'
    and lower(coalesce(f.metadata->>'execution_ready', 'false')) = 'true'
    and f.action_type in ('CALL','MESSAGE','EMAIL')
    and nullif(btrim(coalesce(f.metadata->>'execution_instruction', f.reason)), '') is not null
  on conflict (organization_id, follow_up_id) do nothing;
  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'created', v_created,
    'external_authority_used', false
  );
end;
$$;

revoke all on function public.secretary_materialize_due_follow_up_executions(timestamptz)
  from public, anon, authenticated;
grant execute on function public.secretary_materialize_due_follow_up_executions(timestamptz)
  to service_role;

create or replace function public.claim_secretary_follow_up_execution(
  p_worker_id text,
  p_lease_seconds integer default 180
)
returns setof public.secretary_follow_up_executions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_token uuid := gen_random_uuid();
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'SECRETARY_FOLLOW_UP_EXECUTION_WORKER_REQUIRED' using errcode = '22023';
  end if;

  select id into v_id
  from public.secretary_follow_up_executions
  where status in ('PENDING','FAILED')
    and attempt_count < max_attempts
    and available_at <= now()
    and (lease_expires_at is null or lease_expires_at <= now())
  order by available_at asc, created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  return query
  update public.secretary_follow_up_executions
  set status = 'PROCESSING',
      attempt_count = attempt_count + 1,
      lease_token = v_token,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 180), 900))),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id),
      last_error = null,
      updated_at = now()
  where id = v_id
  returning *;
end;
$$;

revoke all on function public.claim_secretary_follow_up_execution(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_secretary_follow_up_execution(text, integer)
  to service_role;

create or replace function public.secretary_reserve_follow_up_execution_message(
  p_execution_id uuid,
  p_conversation_id uuid,
  p_body text,
  p_subject text default null
)
returns public.communication_messages
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_execution public.secretary_follow_up_executions%rowtype;
  v_conversation public.communication_conversations%rowtype;
  v_message public.communication_messages%rowtype;
begin
  select * into v_execution
  from public.secretary_follow_up_executions
  where id = p_execution_id
  for update;
  if not found then
    raise exception 'SECRETARY_FOLLOW_UP_EXECUTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_execution.action_type not in ('MESSAGE','EMAIL') then
    raise exception 'SECRETARY_FOLLOW_UP_EXECUTION_MESSAGE_ACTION_REQUIRED' using errcode = '22023';
  end if;

  if v_execution.message_id is not null then
    select * into v_message
    from public.communication_messages
    where organization_id = v_execution.organization_id
      and id = v_execution.message_id;
    if not found then
      raise exception 'SECRETARY_FOLLOW_UP_EXECUTION_MESSAGE_NOT_FOUND' using errcode = 'P0002';
    end if;
    return v_message;
  end if;

  select * into v_conversation
  from public.communication_conversations
  where organization_id = v_execution.organization_id
    and id = p_conversation_id
    and customer_party_id = v_execution.contact_party_id
    and upper(coalesce(status, '')) = 'OPEN';
  if not found then
    raise exception 'SECRETARY_FOLLOW_UP_EXECUTION_CONVERSATION_UNAVAILABLE' using errcode = 'P0002';
  end if;

  insert into public.communication_messages (
    organization_id, conversation_id, connection_id, provider, channel_type,
    direction, message_type, recipient_address, subject, body, status,
    sent_by_party_id, metadata
  ) values (
    v_execution.organization_id,
    v_conversation.id,
    v_conversation.connection_id,
    v_conversation.provider,
    v_conversation.channel_type,
    'OUTBOUND',
    'TEXT',
    coalesce(v_conversation.external_participant_address, v_conversation.external_participant_id),
    coalesce(nullif(btrim(coalesce(p_subject, '')), ''), v_conversation.subject),
    btrim(p_body),
    'QUEUED',
    null,
    jsonb_build_object(
      'source', 'AVANTIQO_SECRETARY',
      'secretary_follow_up_execution_id', v_execution.id,
      'secretary_follow_up_id', v_execution.follow_up_id,
      'delivery_authorized', true,
      'external_authority_used', false
    )
  ) returning * into v_message;

  update public.secretary_follow_up_executions
  set conversation_id = v_conversation.id,
      message_id = v_message.id,
      updated_at = now()
  where id = v_execution.id;

  return v_message;
end;
$$;

revoke all on function public.secretary_reserve_follow_up_execution_message(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.secretary_reserve_follow_up_execution_message(uuid, uuid, text, text)
  to service_role;

comment on table public.secretary_follow_up_executions is
  'Durable Avantiqo-owned execution evidence for due Secretary-owned follow-ups. Business follow-up state remains in secretary_follow_ups.';
comment on function public.secretary_materialize_due_follow_up_executions(timestamptz) is
  'Materializes only explicit due follow-ups classified as SECRETARY-owned and execution-ready.';

commit;
