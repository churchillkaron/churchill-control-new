begin;

-- Retire the final obsolete ingredient-era stock helper. Canonical inventory
-- execution uses organization-scoped item and movement runtimes instead.
do $$
declare
  routine record;
  retired_count integer := 0;
begin
  for routine in
    select procedure.oid::regprocedure as signature
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'decrement_stock'
  loop
    execute format('drop function %s', routine.signature);
    retired_count := retired_count + 1;
  end loop;

  raise notice 'Retired % obsolete decrement_stock routine(s)', retired_count;
end;
$$;

-- The currency-revaluation uniqueness index is partial because only scoped
-- period records participate. PostgreSQL conflict inference must include the
-- same predicate or it cannot select that unique index.
create or replace function public.finance_run_fx_revaluation_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_revaluations jsonb,
  p_currency_code text,
  p_journal_lines jsonb,
  p_created_by uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.accounting_periods%rowtype;
  v_existing jsonb;
  v_request_hash text;
  v_row jsonb;
  v_journal jsonb;
  v_journal_id uuid;
  v_step public.finance_period_close_steps%rowtype;
  v_total_gain_loss numeric := 0;
  v_result jsonb;
begin
  v_period := public.finance_assert_open_period(
    p_organization_id,
    p_entity_id,
    p_period_id
  );

  if coalesce(jsonb_array_length(p_revaluations), 0) = 0 then
    raise exception 'FX revaluation rows required';
  end if;

  if coalesce(jsonb_array_length(p_journal_lines), 0) < 2 then
    raise exception 'FX revaluation journal requires at least two lines';
  end if;

  v_request_hash := md5(concat_ws(
    '|',
    p_period_id::text,
    upper(btrim(p_currency_code)),
    p_revaluations::text,
    p_journal_lines::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_FX_REVALUATION',
    p_idempotency_key,
    v_request_hash,
    p_period_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => v_period.end_date,
    p_document_date => v_period.end_date,
    p_journal_type => 'PERIOD_CLOSE',
    p_reference => 'period-close:' || p_period_id::text || ':fx-revaluation',
    p_source_module => 'period_close',
    p_source_document => 'FX_REVALUATION',
    p_source_document_id => p_period_id,
    p_description => 'Foreign currency revaluation',
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => 1,
    p_lines => p_journal_lines,
    p_created_by => p_created_by,
    p_idempotency_key => 'period-close:' || p_period_id::text || ':fx-revaluation:' || btrim(p_idempotency_key)
  ) into v_journal;

  v_journal_id := nullif(v_journal->'journal'->>'id', '')::uuid;

  for v_row in
    select value
    from jsonb_array_elements(p_revaluations)
  loop
    v_total_gain_loss := v_total_gain_loss
      + coalesce(nullif(v_row->>'gain_loss', '')::numeric, 0);

    insert into public.currency_revaluations (
      organization_id,
      entity_id,
      period_id,
      account_id,
      base_currency,
      target_currency,
      old_value,
      new_value,
      gain_loss,
      closing_rate,
      journal_entry_id,
      idempotency_key,
      created_at
    ) values (
      p_organization_id,
      p_entity_id,
      p_period_id,
      (v_row->>'account_id')::uuid,
      upper(btrim(v_row->>'foreign_currency')),
      upper(btrim(p_currency_code)),
      coalesce(nullif(v_row->>'carrying_value', '')::numeric, 0),
      coalesce(nullif(v_row->>'closing_value', '')::numeric, 0),
      coalesce(nullif(v_row->>'gain_loss', '')::numeric, 0),
      coalesce(nullif(v_row->>'closing_rate', '')::numeric, 0),
      v_journal_id,
      btrim(p_idempotency_key),
      now()
    )
    on conflict (
      organization_id,
      entity_id,
      period_id,
      account_id,
      upper(btrim(base_currency)),
      upper(btrim(target_currency))
    )
    where period_id is not null
    do update set
      old_value = excluded.old_value,
      new_value = excluded.new_value,
      gain_loss = excluded.gain_loss,
      closing_rate = excluded.closing_rate,
      journal_entry_id = excluded.journal_entry_id,
      idempotency_key = excluded.idempotency_key;
  end loop;

  insert into public.finance_period_close_steps (
    organization_id,
    entity_id,
    period_id,
    step_type,
    status,
    journal_entry_id,
    evidence,
    idempotency_key,
    completed_by,
    completed_at,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_period_id,
    'FX_REVALUATION',
    'COMPLETED',
    v_journal_id,
    jsonb_build_object(
      'revaluation_count', jsonb_array_length(p_revaluations),
      'total_gain_loss', v_total_gain_loss,
      'functional_currency', upper(btrim(p_currency_code))
    ),
    btrim(p_idempotency_key),
    p_created_by,
    now(),
    now(),
    now()
  )
  on conflict (organization_id, entity_id, period_id, step_type)
  do update set
    status = 'COMPLETED',
    journal_entry_id = excluded.journal_entry_id,
    evidence = excluded.evidence,
    idempotency_key = excluded.idempotency_key,
    completed_by = excluded.completed_by,
    completed_at = excluded.completed_at,
    updated_at = now()
  returning * into v_step;

  v_result := jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'step', to_jsonb(v_step),
    'journal', v_journal
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_FX_REVALUATION',
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_run_fx_revaluation_atomic(
  uuid,
  uuid,
  uuid,
  jsonb,
  text,
  jsonb,
  uuid,
  text
) from public;

grant execute on function public.finance_run_fx_revaluation_atomic(
  uuid,
  uuid,
  uuid,
  jsonb,
  text,
  jsonb,
  uuid,
  text
) to service_role;

notify pgrst, 'reload schema';

commit;
