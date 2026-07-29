begin;

do $$
begin
  if to_regclass('public.operations_events') is null then
    raise notice
      'Operations event actor projection skipped because public.operations_events is not installed in this environment.';
    return;
  end if;

  raise notice
    'Legacy Operations event actor backfill intentionally skipped: immutable Operations events are never rewritten. New events receive actor_id during transactional outbox publication.';
end
$$;

commit;
