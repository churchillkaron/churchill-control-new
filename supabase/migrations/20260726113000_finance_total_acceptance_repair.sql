begin;

create or replace function public.finance_guard_generated_journal_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original_number text;
  v_next_number bigint;
  v_candidate text;
begin
  if new.organization_id is null
     or nullif(btrim(new.journal_number), '') is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.journal_entries existing
    where existing.organization_id = new.organization_id
      and existing.journal_number = new.journal_number
      and existing.id is distinct from new.id
  ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      new.organization_id::text || ':journal-number',
      0
    )
  );

  select coalesce(
    max(
      coalesce(
        nullif(
          substring(journal_number from '([0-9]+)$'),
          ''
        )::bigint,
        0
      )
    ),
    0
  ) + 1
  into v_next_number
  from public.journal_entries
  where organization_id = new.organization_id;

  loop
    v_candidate := 'JE-' || lpad(v_next_number::text, 8, '0');

    exit when not exists (
      select 1
      from public.journal_entries existing
      where existing.organization_id = new.organization_id
        and existing.journal_number = v_candidate
        and existing.id is distinct from new.id
    );

    v_next_number := v_next_number + 1;
  end loop;

  v_original_number := new.journal_number;
  new.journal_number := v_candidate;

  if new.entry_number is null
     or new.entry_number = v_original_number then
    new.entry_number := v_candidate;
  end if;

  return new;
end;
$$;

drop trigger if exists zzzz_finance_generated_journal_number_guard
on public.journal_entries;

create trigger zzzz_finance_generated_journal_number_guard
before insert or update of organization_id, journal_number
on public.journal_entries
for each row
execute function public.finance_guard_generated_journal_number();

do $$
declare
  v_constraint record;
  v_orphan_count bigint;
begin
  if to_regclass('public.accounts_payable') is null then
    raise exception 'accounts_payable table is required';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounts_payable'
      and column_name = 'vendor_party_id'
  ) then
    raise exception 'accounts_payable.vendor_party_id is required';
  end if;

  for v_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.accounts_payable'::regclass
      and constraint_row.contype = 'f'
      and exists (
        select 1
        from unnest(constraint_row.conkey) as key_column(attnum)
        join pg_attribute attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
         and attribute_row.attnum = key_column.attnum
        where attribute_row.attname = 'vendor_party_id'
      )
  loop
    execute format(
      'alter table public.accounts_payable drop constraint %I',
      v_constraint.conname
    );
  end loop;

  update public.accounts_payable payable
  set vendor_party_id = profile.party_id
  from public.supplier_profiles profile
  where payable.vendor_party_id = profile.id
    and profile.organization_id = payable.organization_id
    and not exists (
      select 1
      from public.parties party
      where party.id = payable.vendor_party_id
        and party.organization_id = payable.organization_id
    );

  select count(*)
  into v_orphan_count
  from public.accounts_payable payable
  left join public.parties party
    on party.id = payable.vendor_party_id
   and party.organization_id = payable.organization_id
  where payable.vendor_party_id is not null
    and party.id is null;

  if v_orphan_count > 0 then
    raise exception
      'Cannot align accounts_payable.vendor_party_id: % orphaned vendor reference(s) remain',
      v_orphan_count;
  end if;

  alter table public.accounts_payable
    add constraint accounts_payable_vendor_party_id_fkey
    foreign key (vendor_party_id)
    references public.parties(id)
    not valid;

  alter table public.accounts_payable
    validate constraint accounts_payable_vendor_party_id_fkey;
end;
$$;

create or replace function public.finance_run_total_acceptance_probe_v4(
  p_organization_id uuid,
  p_entity_id uuid,
  p_actor_id uuid,
  p_posting_date date,
  p_currency_code text,
  p_exchange_rate numeric,
  p_asset_account_id uuid default null,
  p_revenue_account_id uuid default null,
  p_expense_account_id uuid default null,
  p_liability_account_id uuid default null,
  p_bank_account_id uuid default null,
  p_customer_id uuid default null,
  p_vendor_party_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_error text;
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_vendor_party_id uuid := p_vendor_party_id;
  v_supplier_profile_id uuid;
  v_party_type text;
  v_vendor_provisioned boolean := false;
begin
  if p_organization_id is null or p_entity_id is null or p_actor_id is null then
    raise exception 'organization_id, entity_id and actor_id required';
  end if;

  if p_customer_id is null then
    raise exception 'customer_id required';
  end if;

  if v_vendor_party_id is null then
    select party.party_type
    into v_party_type
    from public.customer_loyalty_accounts customer
    join public.parties party
      on party.id = customer.party_id
     and party.organization_id = customer.organization_id
    where customer.id = p_customer_id
      and customer.organization_id = p_organization_id
      and customer.entity_id = p_entity_id
    limit 1;

    if nullif(btrim(v_party_type), '') is null then
      raise exception 'A scoped customer party with a valid party_type is required for rollback-safe vendor provisioning';
    end if;

    insert into public.parties (
      organization_id,
      party_type,
      legal_name,
      display_name,
      status,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      v_party_type,
      'Rollback Acceptance Vendor ' || substr(v_tag, 1, 8),
      'Rollback Acceptance Vendor',
      'ACTIVE',
      now(),
      now()
    ) returning id into v_vendor_party_id;

    insert into public.party_relationships (
      party_id,
      organization_id,
      relationship_type,
      status,
      metadata,
      created_at,
      updated_at
    ) values (
      v_vendor_party_id,
      p_organization_id,
      'supplier',
      'ACTIVE',
      jsonb_build_object('acceptance_probe', true),
      now(),
      now()
    );

    insert into public.supplier_profiles (
      organization_id,
      party_id,
      vendor_code,
      risk_level,
      is_active,
      is_blocked,
      notes,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      v_vendor_party_id,
      'TST-' || substr(v_tag, 1, 12),
      'LOW',
      true,
      false,
      'Rollback-safe Finance acceptance supplier',
      now(),
      now()
    ) returning id into v_supplier_profile_id;

    v_vendor_provisioned := true;
  else
    select profile.id
    into v_supplier_profile_id
    from public.supplier_profiles profile
    where profile.organization_id = p_organization_id
      and profile.party_id = v_vendor_party_id
      and coalesce(profile.is_active, true) = true
    order by profile.created_at desc nulls last, profile.id
    limit 1;

    if v_supplier_profile_id is null then
      raise exception 'Existing vendor party has no active supplier profile';
    end if;
  end if;

  v_result := public.finance_run_total_acceptance_probe_v2(
    p_organization_id,
    p_entity_id,
    p_actor_id,
    p_posting_date,
    p_currency_code,
    p_exchange_rate,
    p_asset_account_id,
    p_revenue_account_id,
    p_expense_account_id,
    p_liability_account_id,
    p_bank_account_id,
    p_customer_id,
    v_vendor_party_id
  );

  v_result := jsonb_set(
    v_result,
    '{results}',
    coalesce(v_result->'results', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'name', 'probe.supplier_profile_rolled_back',
        'passed', true,
        'details', jsonb_build_object(
          'vendor_provisioned', v_vendor_provisioned,
          'supplier_profile_id', v_supplier_profile_id,
          'rollback_scope', 'v4_wrapper_subtransaction'
        )
      )
    ),
    true
  );

  raise exception '__FINANCE_ACCEPTANCE_V4_ROLLBACK__';
exception when others then
  get stacked diagnostics v_error = message_text;

  if v_error = '__FINANCE_ACCEPTANCE_V4_ROLLBACK__' then
    return v_result || jsonb_build_object(
      'rolled_back', true,
      'prerequisites_rolled_back', true,
      'supplier_profile_rolled_back', true,
      'vendor_provisioned', v_vendor_provisioned
    );
  end if;

  return jsonb_build_object(
    'success', false,
    'rolled_back', true,
    'prerequisites_rolled_back', true,
    'supplier_profile_rolled_back', true,
    'vendor_provisioned', v_vendor_provisioned,
    'results', jsonb_build_array(
      jsonb_build_object(
        'name', 'probe.v4_unexpected_failure',
        'passed', false,
        'message', v_error
      )
    ),
    'passed', 0,
    'failed', 1
  );
end;
$$;

revoke all on function public.finance_run_total_acceptance_probe_v4(
  uuid, uuid, uuid, date, text, numeric,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.finance_run_total_acceptance_probe_v4(
  uuid, uuid, uuid, date, text, numeric,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
