begin;

alter table public.accounting_periods
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid;

alter table public.depreciation_entries
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists journal_entry_id uuid,
  add column if not exists idempotency_key text;

create unique index if not exists depreciation_entries_period_asset_unique
on public.depreciation_entries (
  organization_id,
  entity_id,
  period_id,
  fixed_asset_id
)
where period_id is not null;

create table if not exists public.finance_period_close_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  period_id uuid not null,
  step_type text not null,
  status text not null,
  journal_entry_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  completed_by uuid,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_id, period_id, step_type)
);

create table if not exists public.finance_period_close_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  period_id uuid not null,
  close_type text not null,
  status text not null,
  required_steps jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_id, period_id, close_type)
);

create or replace function public.finance_assert_open_period(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid
)
returns public.accounting_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.accounting_periods%rowtype;
begin
  select *
  into v_period
  from public.accounting_periods
  where id = p_period_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Accounting period is outside organization or entity scope';
  end if;

  if lower(coalesce(v_period.status, 'open')) in ('closed', 'locked') then
    raise exception 'Accounting period is already closed or locked';
  end if;

  return v_period;
end;
$$;

create or replace function public.finance_record_period_close_step_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_step_type text,
  p_status text,
  p_evidence jsonb,
  p_completed_by uuid,
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
  v_result jsonb;
  v_request_hash text;
  v_step public.finance_period_close_steps%rowtype;
begin
  if upper(btrim(p_status)) not in ('COMPLETED', 'SKIPPED') then
    raise exception 'Close step status must be COMPLETED or SKIPPED';
  end if;

  if nullif(btrim(p_step_type), '') is null then
    raise exception 'step_type required';
  end if;

  if upper(btrim(p_status)) = 'SKIPPED'
     and nullif(btrim(coalesce(p_evidence->>'reason', '')), '') is null then
    raise exception 'Skipped close step requires evidence reason';
  end if;

  v_period := public.finance_assert_open_period(
    p_organization_id,
    p_entity_id,
    p_period_id
  );

  v_request_hash := md5(concat_ws(
    '|',
    p_period_id::text,
    upper(btrim(p_step_type)),
    upper(btrim(p_status)),
    coalesce(p_evidence, '{}'::jsonb)::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_CLOSE_STEP_' || upper(btrim(p_step_type)),
    p_idempotency_key,
    v_request_hash,
    p_period_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.finance_period_close_steps (
    organization_id,
    entity_id,
    period_id,
    step_type,
    status,
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
    upper(btrim(p_step_type)),
    upper(btrim(p_status)),
    coalesce(p_evidence, '{}'::jsonb),
    btrim(p_idempotency_key),
    p_completed_by,
    now(),
    now(),
    now()
  )
  on conflict (organization_id, entity_id, period_id, step_type)
  do update set
    status = excluded.status,
    evidence = excluded.evidence,
    idempotency_key = excluded.idempotency_key,
    completed_by = excluded.completed_by,
    completed_at = excluded.completed_at,
    updated_at = now()
  returning * into v_step;

  v_result := jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'step', to_jsonb(v_step)
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_CLOSE_STEP_' || upper(btrim(p_step_type)),
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.finance_post_period_adjustment_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_step_type text,
  p_source_id uuid,
  p_description text,
  p_currency_code text,
  p_exchange_rate numeric,
  p_journal_lines jsonb,
  p_evidence jsonb,
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
  v_journal jsonb;
  v_result jsonb;
  v_request_hash text;
  v_journal_id uuid;
  v_step public.finance_period_close_steps%rowtype;
begin
  if coalesce(jsonb_array_length(p_journal_lines), 0) = 0 then
    raise exception 'journal lines required';
  end if;

  v_period := public.finance_assert_open_period(
    p_organization_id,
    p_entity_id,
    p_period_id
  );

  v_request_hash := md5(concat_ws(
    '|',
    p_period_id::text,
    upper(btrim(p_step_type)),
    coalesce(p_source_id::text, ''),
    coalesce(p_description, ''),
    upper(btrim(p_currency_code)),
    p_exchange_rate::text,
    p_journal_lines::text,
    coalesce(p_evidence, '{}'::jsonb)::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_ADJUSTMENT_' || upper(btrim(p_step_type)),
    p_idempotency_key,
    v_request_hash,
    coalesce(p_source_id, p_period_id)
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
    p_reference => 'period-close:' || p_period_id::text || ':' || lower(btrim(p_step_type)),
    p_source_module => 'period_close',
    p_source_document => upper(btrim(p_step_type)),
    p_source_document_id => coalesce(p_source_id, p_period_id),
    p_description => p_description,
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_created_by,
    p_idempotency_key => 'period-close:' || p_period_id::text || ':' || lower(btrim(p_step_type)) || ':' || btrim(p_idempotency_key)
  ) into v_journal;

  v_journal_id := nullif(v_journal->'journal'->>'id', '')::uuid;

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
    upper(btrim(p_step_type)),
    'COMPLETED',
    v_journal_id,
    coalesce(p_evidence, '{}'::jsonb),
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
    'PERIOD_ADJUSTMENT_' || upper(btrim(p_step_type)),
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.finance_run_period_depreciation_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_entries jsonb,
  p_currency_code text,
  p_exchange_rate numeric,
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
  v_entry jsonb;
  v_asset public.fixed_assets%rowtype;
  v_amount numeric;
  v_total numeric := 0;
  v_count integer := 0;
  v_journal jsonb;
  v_result jsonb;
  v_existing jsonb;
  v_request_hash text;
  v_journal_id uuid;
begin
  v_period := public.finance_assert_open_period(
    p_organization_id,
    p_entity_id,
    p_period_id
  );

  if coalesce(jsonb_array_length(p_entries), 0) = 0 then
    raise exception 'depreciation entries required';
  end if;

  v_request_hash := md5(concat_ws(
    '|',
    p_period_id::text,
    p_entries::text,
    upper(btrim(p_currency_code)),
    p_exchange_rate::text,
    p_journal_lines::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_DEPRECIATION',
    p_idempotency_key,
    v_request_hash,
    p_period_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  for v_entry in
    select value from jsonb_array_elements(p_entries)
  loop
    select *
    into v_asset
    from public.fixed_assets
    where id = (v_entry->>'fixed_asset_id')::uuid
      and organization_id = p_organization_id
      and entity_id = p_entity_id
    for update;

    if not found then
      raise exception 'Fixed asset is outside organization or entity scope';
    end if;

    if lower(coalesce(v_asset.status, 'active')) <> 'active' then
      raise exception 'Only active fixed assets can be depreciated';
    end if;

    v_amount := coalesce(nullif(v_entry->>'amount', '')::numeric, 0);

    if v_amount <= 0 then
      raise exception 'Depreciation amount must be positive';
    end if;

    if v_amount > greatest(
      coalesce(v_asset.current_book_value, v_asset.purchase_cost, 0) - coalesce(v_asset.salvage_value, 0),
      0
    ) then
      raise exception 'Depreciation exceeds remaining depreciable value';
    end if;

    insert into public.depreciation_entries (
      organization_id,
      entity_id,
      period_id,
      fixed_asset_id,
      depreciation_date,
      depreciation_amount,
      idempotency_key
    ) values (
      p_organization_id,
      p_entity_id,
      p_period_id,
      v_asset.id,
      v_period.end_date,
      v_amount,
      btrim(p_idempotency_key)
    );

    update public.fixed_assets
    set accumulated_depreciation = coalesce(accumulated_depreciation, 0) + v_amount,
        current_book_value = greatest(
          coalesce(current_book_value, purchase_cost, 0) - v_amount,
          coalesce(salvage_value, 0)
        ),
        updated_at = now()
    where id = v_asset.id;

    v_total := v_total + v_amount;
    v_count := v_count + 1;
  end loop;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => v_period.end_date,
    p_document_date => v_period.end_date,
    p_journal_type => 'PERIOD_CLOSE',
    p_reference => 'period-close:' || p_period_id::text || ':depreciation',
    p_source_module => 'fixed_assets',
    p_source_document => 'DEPRECIATION_POSTED',
    p_source_document_id => p_period_id,
    p_description => 'Period depreciation',
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_created_by,
    p_idempotency_key => 'period-close:' || p_period_id::text || ':depreciation:' || btrim(p_idempotency_key)
  ) into v_journal;

  v_journal_id := nullif(v_journal->'journal'->>'id', '')::uuid;

  update public.depreciation_entries
  set journal_entry_id = v_journal_id
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and period_id = p_period_id
    and idempotency_key = btrim(p_idempotency_key);

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
    'DEPRECIATION',
    'COMPLETED',
    v_journal_id,
    jsonb_build_object('asset_count', v_count, 'total_amount', v_total),
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
    updated_at = now();

  v_result := jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'asset_count', v_count,
    'total_amount', v_total,
    'journal', v_journal
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_DEPRECIATION',
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.finance_close_period_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_close_type text,
  p_required_steps jsonb,
  p_closed_by uuid,
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
  v_missing_steps text[];
  v_unposted_count bigint;
  v_unbalanced_count bigint;
  v_run public.finance_period_close_runs%rowtype;
  v_result jsonb;
begin
  v_period := public.finance_assert_open_period(
    p_organization_id,
    p_entity_id,
    p_period_id
  );

  if upper(btrim(p_close_type)) not in ('MONTH_END', 'YEAR_END') then
    raise exception 'close_type must be MONTH_END or YEAR_END';
  end if;

  v_request_hash := md5(concat_ws(
    '|',
    p_period_id::text,
    upper(btrim(p_close_type)),
    coalesce(p_required_steps, '[]'::jsonb)::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_CLOSE_' || upper(btrim(p_close_type)),
    p_idempotency_key,
    v_request_hash,
    p_period_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  select array_agg(required_step)
  into v_missing_steps
  from (
    select upper(btrim(value)) as required_step
    from jsonb_array_elements_text(coalesce(p_required_steps, '[]'::jsonb))
  ) required
  left join public.finance_period_close_steps step
    on step.organization_id = p_organization_id
   and step.entity_id = p_entity_id
   and step.period_id = p_period_id
   and step.step_type = required.required_step
   and step.status in ('COMPLETED', 'SKIPPED')
  where step.id is null;

  if coalesce(array_length(v_missing_steps, 1), 0) > 0 then
    raise exception 'Period close steps incomplete: %', array_to_string(v_missing_steps, ', ');
  end if;

  select count(*)
  into v_unposted_count
  from public.journal_entries
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and posting_date between v_period.start_date and v_period.end_date
    and upper(coalesce(status, '')) <> 'POSTED';

  if v_unposted_count > 0 then
    raise exception 'Period close blocked: % unposted journal(s) exist in selected period', v_unposted_count;
  end if;

  select count(*)
  into v_unbalanced_count
  from (
    select journal.id
    from public.journal_entries journal
    join public.journal_entry_lines line
      on line.journal_entry_id = journal.id
    where journal.organization_id = p_organization_id
      and journal.entity_id = p_entity_id
      and journal.posting_date between v_period.start_date and v_period.end_date
      and upper(coalesce(journal.status, '')) = 'POSTED'
    group by journal.id
    having abs(sum(coalesce(line.debit, 0)) - sum(coalesce(line.credit, 0))) > 0.005
  ) unbalanced;

  if v_unbalanced_count > 0 then
    raise exception 'Period close blocked: % unbalanced posted journal(s) exist', v_unbalanced_count;
  end if;

  insert into public.finance_period_close_runs (
    organization_id,
    entity_id,
    period_id,
    close_type,
    status,
    required_steps,
    idempotency_key,
    closed_by,
    closed_at,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_period_id,
    upper(btrim(p_close_type)),
    'LOCKED',
    coalesce(p_required_steps, '[]'::jsonb),
    btrim(p_idempotency_key),
    p_closed_by,
    now(),
    now(),
    now()
  )
  on conflict (organization_id, entity_id, period_id, close_type)
  do update set
    status = 'LOCKED',
    required_steps = excluded.required_steps,
    idempotency_key = excluded.idempotency_key,
    closed_by = excluded.closed_by,
    closed_at = excluded.closed_at,
    updated_at = now()
  returning * into v_run;

  update public.accounting_periods
  set status = 'locked',
      closed_at = now(),
      closed_by = p_closed_by::text,
      locked_at = now(),
      locked_by = p_closed_by,
      updated_at = now()
  where id = p_period_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  insert into public.audit_logs (
    organization_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_organization_id,
    'ACCOUNTING_PERIOD_' || upper(btrim(p_close_type)) || '_LOCKED',
    'accounting_period',
    p_period_id,
    jsonb_build_object(
      'entity_id', p_entity_id,
      'period_start', v_period.start_date,
      'period_end', v_period.end_date,
      'required_steps', coalesce(p_required_steps, '[]'::jsonb),
      'closed_by', p_closed_by,
      'close_run_id', v_run.id
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'status', 'locked',
    'period_id', p_period_id,
    'close_run', to_jsonb(v_run)
  );

  update public.finance_period_close_runs
  set result = v_result,
      updated_at = now()
  where id = v_run.id;

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_CLOSE_' || upper(btrim(p_close_type)),
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_assert_open_period(uuid, uuid, uuid) from public;
revoke all on function public.finance_record_period_close_step_atomic(uuid, uuid, uuid, text, text, jsonb, uuid, text) from public;
revoke all on function public.finance_post_period_adjustment_atomic(uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, uuid, text) from public;
revoke all on function public.finance_run_period_depreciation_atomic(uuid, uuid, uuid, jsonb, text, numeric, jsonb, uuid, text) from public;
revoke all on function public.finance_close_period_atomic(uuid, uuid, uuid, text, jsonb, uuid, text) from public;

grant execute on function public.finance_record_period_close_step_atomic(uuid, uuid, uuid, text, text, jsonb, uuid, text) to service_role;
grant execute on function public.finance_post_period_adjustment_atomic(uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, uuid, text) to service_role;
grant execute on function public.finance_run_period_depreciation_atomic(uuid, uuid, uuid, jsonb, text, numeric, jsonb, uuid, text) to service_role;
grant execute on function public.finance_close_period_atomic(uuid, uuid, uuid, text, jsonb, uuid, text) to service_role;

commit;
