create table if not exists public.platform_acquisition_obligations (
  id uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null references public.platform_acquisition_records(id) on delete cascade,
  seller_organization_id uuid not null,
  stage text not null,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'OPEN' check (status in ('OPEN','DONE','CANCELLED')),
  schedule_note text null,
  completion_evidence_reference text null,
  completion_note text null,
  owner_staff_account_id uuid not null references public.staff_accounts(id),
  completed_by_staff_account_id uuid null references public.staff_accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create unique index if not exists platform_acquisition_obligations_one_open_idx
  on public.platform_acquisition_obligations (acquisition_id)
  where status = 'OPEN';

create index if not exists platform_acquisition_obligations_seller_due_idx
  on public.platform_acquisition_obligations (seller_organization_id, status, due_at);

alter table public.platform_acquisition_obligations enable row level security;
revoke all on table public.platform_acquisition_obligations from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_acquisition_obligations to service_role;

create or replace function public.platform_set_acquisition_obligation(
  p_acquisition_id uuid,
  p_seller_organization_id uuid,
  p_expected_stage text,
  p_title text,
  p_due_at timestamptz,
  p_schedule_note text,
  p_owner_staff_account_id uuid,
  p_reschedule_reason text default null
)
returns public.platform_acquisition_obligations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_acquisition public.platform_acquisition_records%rowtype;
  v_existing public.platform_acquisition_obligations%rowtype;
  v_result public.platform_acquisition_obligations%rowtype;
begin
  select * into v_acquisition
    from public.platform_acquisition_records
   where id = p_acquisition_id
     and seller_organization_id = p_seller_organization_id
   for update;

  if not found then raise exception 'ACQUISITION_NOT_FOUND'; end if;
  if v_acquisition.stage <> p_expected_stage then
    raise exception 'ACQUISITION_STAGE_CONFLICT:%:%', v_acquisition.stage, p_expected_stage;
  end if;
  if v_acquisition.stage in ('FIRST_VALUE', 'LOST') then
    raise exception 'ACQUISITION_OBLIGATION_TERMINAL_STAGE';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'ACQUISITION_OBLIGATION_TITLE_REQUIRED';
  end if;
  if p_due_at is null or p_due_at <= now() then
    raise exception 'ACQUISITION_OBLIGATION_FUTURE_DUE_REQUIRED';
  end if;
  if p_schedule_note is null or btrim(p_schedule_note) = '' then
    raise exception 'ACQUISITION_OBLIGATION_SCHEDULE_NOTE_REQUIRED';
  end if;
  if p_owner_staff_account_id is null then
    raise exception 'ACQUISITION_OBLIGATION_OWNER_REQUIRED';
  end if;

  select * into v_existing
    from public.platform_acquisition_obligations
   where acquisition_id = p_acquisition_id
     and status = 'OPEN'
   for update;

  if found then
    if p_reschedule_reason is null or btrim(p_reschedule_reason) = '' then
      raise exception 'ACQUISITION_OBLIGATION_RESCHEDULE_REASON_REQUIRED';
    end if;
    update public.platform_acquisition_obligations
       set status = 'CANCELLED',
           completion_note = 'Superseded by owner reschedule: ' || btrim(p_reschedule_reason),
           completed_at = now(),
           updated_at = now()
     where id = v_existing.id;
  end if;

  insert into public.platform_acquisition_obligations (
    acquisition_id,
    seller_organization_id,
    stage,
    title,
    due_at,
    schedule_note,
    owner_staff_account_id
  ) values (
    p_acquisition_id,
    p_seller_organization_id,
    v_acquisition.stage,
    btrim(p_title),
    p_due_at,
    btrim(p_schedule_note),
    p_owner_staff_account_id
  ) returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.platform_complete_acquisition_obligation(
  p_obligation_id uuid,
  p_seller_organization_id uuid,
  p_completion_evidence_reference text,
  p_completion_note text,
  p_completed_by_staff_account_id uuid
)
returns public.platform_acquisition_obligations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_obligation public.platform_acquisition_obligations%rowtype;
begin
  select * into v_obligation
    from public.platform_acquisition_obligations
   where id = p_obligation_id
     and seller_organization_id = p_seller_organization_id
   for update;

  if not found then raise exception 'ACQUISITION_OBLIGATION_NOT_FOUND'; end if;
  if v_obligation.status <> 'OPEN' then raise exception 'ACQUISITION_OBLIGATION_NOT_OPEN'; end if;
  if p_completion_evidence_reference is null or btrim(p_completion_evidence_reference) = '' then
    raise exception 'ACQUISITION_OBLIGATION_COMPLETION_EVIDENCE_REQUIRED';
  end if;
  if p_completion_note is null or btrim(p_completion_note) = '' then
    raise exception 'ACQUISITION_OBLIGATION_COMPLETION_NOTE_REQUIRED';
  end if;
  if p_completed_by_staff_account_id is null then
    raise exception 'ACQUISITION_OBLIGATION_COMPLETER_REQUIRED';
  end if;

  update public.platform_acquisition_obligations
     set status = 'DONE',
         completion_evidence_reference = btrim(p_completion_evidence_reference),
         completion_note = btrim(p_completion_note),
         completed_by_staff_account_id = p_completed_by_staff_account_id,
         completed_at = now(),
         updated_at = now()
   where id = v_obligation.id
   returning * into v_obligation;

  return v_obligation;
end;
$$;

create or replace function public.platform_cancel_acquisition_obligation_on_stage_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.stage is distinct from new.stage then
    update public.platform_acquisition_obligations
       set status = 'CANCELLED',
           completion_note = 'Cancelled automatically because acquisition advanced from ' || old.stage || ' to ' || new.stage || '.',
           completed_at = now(),
           updated_at = now()
     where acquisition_id = new.id
       and status = 'OPEN';
  end if;
  return new;
end;
$$;

drop trigger if exists platform_acquisition_obligation_stage_change_trg on public.platform_acquisition_records;
create trigger platform_acquisition_obligation_stage_change_trg
after update of stage on public.platform_acquisition_records
for each row
when (old.stage is distinct from new.stage)
execute function public.platform_cancel_acquisition_obligation_on_stage_change();

revoke all on function public.platform_set_acquisition_obligation(uuid, uuid, text, text, timestamptz, text, uuid, text) from public, anon, authenticated;
grant execute on function public.platform_set_acquisition_obligation(uuid, uuid, text, text, timestamptz, text, uuid, text) to service_role;
revoke all on function public.platform_complete_acquisition_obligation(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.platform_complete_acquisition_obligation(uuid, uuid, text, text, uuid) to service_role;