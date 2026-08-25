begin;

create extension if not exists btree_gist with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'secretary_calendar_no_owner_overlap'
      and conrelid = 'public.secretary_calendar_events'::regclass
  ) then
    alter table public.secretary_calendar_events
      add constraint secretary_calendar_no_owner_overlap
      exclude using gist (
        organization_id with =,
        owner_party_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status <> 'CANCELLED');
  end if;
end;
$$;

comment on constraint secretary_calendar_no_owner_overlap on public.secretary_calendar_events is
  'Avantiqo-native final database guard against overlapping active calendar events for the same organization and owner. Adjacent events are allowed; cancelled events do not block time.';

commit;
