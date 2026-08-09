create table if not exists public.commercial_loyalty_event_deliveries (
  event_id uuid primary key references public.system_events(id) on delete cascade,
  organization_id uuid,
  party_id uuid,
  program_id uuid references public.commercial_loyalty_programs(id) on delete set null,
  status text not null,
  reason text,
  result jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1,
  processed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text,
  constraint commercial_loyalty_event_deliveries_status_check
    check (status in ('AWARDED','IGNORED','FAILED'))
);

create index if not exists commercial_loyalty_event_deliveries_org_status_idx
  on public.commercial_loyalty_event_deliveries(organization_id,status,processed_at desc);
create index if not exists commercial_loyalty_event_deliveries_party_idx
  on public.commercial_loyalty_event_deliveries(organization_id,party_id,processed_at desc);

alter table public.commercial_loyalty_event_deliveries enable row level security;
revoke all on public.commercial_loyalty_event_deliveries from anon,authenticated;
grant select,insert,update on public.commercial_loyalty_event_deliveries to service_role;

do $migration$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.commercial_loyalty_process_system_event(uuid,uuid)'::regprocedure
  ) into v_def;

  if v_def is null then
    raise exception 'commercial_loyalty_process_system_event not found';
  end if;

  v_new := replace(
    v_def,
    '    and (starts_at is null or starts_at <= v_event.created_at)',
    '    and coalesce(starts_at, created_at) <= v_event.created_at'
  );

  v_new := replace(
    v_new,
    $old$    if coalesce((v_rule->>'enabled')::boolean, true) is not true then
      continue;
    end if;$old$,
    $new$    if coalesce((v_rule->>'enabled')::boolean, true) is not true then
      continue;
    end if;

    if nullif(btrim(v_rule->>'effective_from'),'') is not null
       and (v_rule->>'effective_from')::timestamptz > v_event.created_at then
      continue;
    end if;

    if nullif(btrim(v_rule->>'effective_to'),'') is not null
       and (v_rule->>'effective_to')::timestamptz < v_event.created_at then
      continue;
    end if;$new$
  );

  if v_new = v_def then
    raise exception 'Loyalty event effective-date repair made no changes';
  end if;

  execute v_new;
end;
$migration$;
