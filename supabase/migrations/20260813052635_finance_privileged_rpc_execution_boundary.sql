begin;

do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and (
        p.proname like 'finance\_%' escape '\'
        or p.proname in (
          'next_finance_document_number',
          'resolve_finance_exchange_rate'
        )
      )
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      v_function
    );
    execute format(
      'grant execute on function %s to service_role',
      v_function
    );
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and (
        p.proname like 'finance\_%' escape '\'
        or p.proname in (
          'next_finance_document_number',
          'resolve_finance_exchange_rate'
        )
      )
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Finance privileged routine remains executable by Data API role';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and (
        p.proname like 'finance\_%' escape '\'
        or p.proname in (
          'next_finance_document_number',
          'resolve_finance_exchange_rate'
        )
      )
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'Finance privileged routine lost service-role execution';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
