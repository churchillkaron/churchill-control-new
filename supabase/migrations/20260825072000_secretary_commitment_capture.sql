begin;

create table if not exists public.secretary_commitment_extractions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_kind text not null check (source_kind in ('CALL','MESSAGE')),
  source_id uuid not null,
  contact_party_id uuid null,
  conversation_id uuid null references public.communication_conversations(id) on delete set null,
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','COMPLETED','FAILED','SKIPPED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 4 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  extracted_commitments jsonb not null default '[]'::jsonb,
  created_follow_up_ids jsonb not null default '[]'::jsonb,
  created_task_ids jsonb not null default '[]'::jsonb,
  last_error text null,
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_commitment_contact_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  unique (organization_id, source_kind, source_id)
);

create index if not exists secretary_commitment_extractions_claim_idx
  on public.secretary_commitment_extractions (status, available_at, created_at)
  where status in ('PENDING','FAILED');

alter table public.secretary_commitment_extractions enable row level security;
revoke all on public.secretary_commitment_extractions from anon, authenticated;
grant select, insert, update, delete on public.secretary_commitment_extractions to service_role;

create unique index if not exists secretary_follow_ups_commitment_capture_uidx
  on public.secretary_follow_ups ((metadata->>'commitment_extraction_item_key'))
  where metadata ? 'commitment_extraction_item_key';

create unique index if not exists secretary_tasks_commitment_capture_uidx
  on public.secretary_tasks ((metadata->>'commitment_extraction_item_key'))
  where metadata ? 'commitment_extraction_item_key';

create or replace function public.secretary_enqueue_completed_call_commitment_extraction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('COMPLETED','VOICEMAIL')
     and new.ended_at is not null
     and (old.status is distinct from new.status or old.ended_at is distinct from new.ended_at)
  then
    insert into public.secretary_commitment_extractions (
      organization_id, source_kind, source_id, contact_party_id, conversation_id, metadata
    ) values (
      new.organization_id,
      'CALL',
      new.id,
      new.contact_party_id,
      new.conversation_id,
      jsonb_build_object('direction', new.direction, 'source', 'secretary_call_completion')
    )
    on conflict (organization_id, source_kind, source_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.secretary_enqueue_completed_call_commitment_extraction() from public, anon, authenticated;

drop trigger if exists secretary_calls_commitment_capture on public.secretary_calls;
create trigger secretary_calls_commitment_capture
after update of status, ended_at on public.secretary_calls
for each row
execute function public.secretary_enqueue_completed_call_commitment_extraction();

create or replace function public.secretary_enqueue_completed_message_commitment_extraction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from new.status then
    insert into public.secretary_commitment_extractions (
      organization_id, source_kind, source_id, contact_party_id, conversation_id, metadata
    ) values (
      new.organization_id,
      'MESSAGE',
      new.inbound_message_id,
      new.contact_party_id,
      new.conversation_id,
      jsonb_build_object(
        'secretary_message_reception_request_id', new.id,
        'decision_action', new.decision_action,
        'source', 'secretary_message_completion'
      )
    )
    on conflict (organization_id, source_kind, source_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.secretary_enqueue_completed_message_commitment_extraction() from public, anon, authenticated;

drop trigger if exists secretary_message_reception_commitment_capture on public.secretary_message_reception_requests;
create trigger secretary_message_reception_commitment_capture
after update of status on public.secretary_message_reception_requests
for each row
execute function public.secretary_enqueue_completed_message_commitment_extraction();

create or replace function public.claim_secretary_commitment_extraction(
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.secretary_commitment_extractions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_lease uuid := gen_random_uuid();
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'SECRETARY_COMMITMENT_WORKER_REQUIRED';
  end if;

  select id into v_id
  from public.secretary_commitment_extractions
  where status in ('PENDING','FAILED')
    and attempt_count < max_attempts
    and available_at <= now()
    and (lease_expires_at is null or lease_expires_at <= now())
  order by available_at asc, created_at asc
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  return query
  update public.secretary_commitment_extractions
  set status = 'PROCESSING',
      attempt_count = attempt_count + 1,
      lease_token = v_lease,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id),
      last_error = null,
      updated_at = now()
  where id = v_id
  returning *;
end;
$$;

revoke all on function public.claim_secretary_commitment_extraction(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_secretary_commitment_extraction(text, integer)
  to service_role;

comment on table public.secretary_commitment_extractions is
  'Avantiqo-owned durable extraction queue for explicit commitments and follow-up obligations found in completed calls and processed inbound messages.';

commit;
