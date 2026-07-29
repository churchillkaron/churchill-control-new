begin;

do $$
begin
  if to_regclass('public.operations_events') is null then
    raise notice
      'Operations event actor projection skipped because public.operations_events is not installed in this environment.';
    return;
  end if;

  execute
    'alter table public.operations_events disable trigger operations_events_immutable_guard';

  update public.operations_events
  set actor_id = nullif(
    coalesce(
      payload #>> '{record,updated_by}',
      payload #>> '{record,created_by}',
      payload ->> 'actor_id'
    ),
    ''
  )::uuid
  where actor_id is null
    and nullif(
      coalesce(
        payload #>> '{record,updated_by}',
        payload #>> '{record,created_by}',
        payload ->> 'actor_id'
      ),
      ''
    ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  execute
    'alter table public.operations_events enable trigger operations_events_immutable_guard';

  execute
    'comment on column public.operations_events.actor_id is '
    || quote_literal(
      'Authenticated Supabase user responsible for the immutable Operations event. Legacy rows are projected from valid UUID actor values in the event payload.'
    );
end;
$$;

commit;
