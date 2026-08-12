do $$
declare
  context_row record;
  inventory_account_id uuid;
  cogs_account_id uuid;
  candidate_code integer;
begin
  for context_row in
    select distinct
      profile.organization_id,
      profile.entity_id,
      upper(
        coalesce(
          nullif(btrim(profile.functional_currency), ''),
          nullif(btrim(profile.base_currency), ''),
          nullif(btrim(profile.reporting_currency), ''),
          nullif(btrim(entity.currency), '')
        )
      ) as currency_code
    from public.finance_organization_profiles profile
    join public.legal_entities entity
      on entity.id = profile.entity_id
     and entity.organization_id = profile.organization_id
     and coalesce(entity.is_active, true) = true
    where profile.entity_id is not null
      and upper(btrim(coalesce(profile.status, 'ACTIVE'))) = 'ACTIVE'
      and exists (
        select 1
        from public.inventory_items item
        where item.organization_id = profile.organization_id
          and coalesce(item.is_active, true) = true
      )
  loop
    if context_row.currency_code is null then
      raise exception
        'INVENTORY_CONSUMPTION_FINANCE_CURRENCY_REQUIRED:%:%',
        context_row.organization_id,
        context_row.entity_id;
    end if;

    inventory_account_id := null;
    cogs_account_id := null;

    select account.id
      into inventory_account_id
    from public.chart_of_accounts account
    where account.organization_id = context_row.organization_id
      and account.entity_id = context_row.entity_id
      and lower(btrim(account.account_name)) = 'inventory'
      and coalesce(account.is_active, true) = true
    order by coalesce(account.is_system, false) desc, account.account_code
    limit 1;

    if inventory_account_id is null then
      for candidate_code in 1350..1399 loop
        if not exists (
          select 1
          from public.chart_of_accounts account
          where account.organization_id = context_row.organization_id
            and account.entity_id = context_row.entity_id
            and account.account_code = candidate_code::text
        ) then
          insert into public.chart_of_accounts (
            organization_id,
            entity_id,
            account_code,
            account_name,
            account_category,
            normal_balance,
            is_active,
            is_system,
            currency_code
          ) values (
            context_row.organization_id,
            context_row.entity_id,
            candidate_code::text,
            'Inventory',
            'Assets',
            'Debit',
            true,
            true,
            context_row.currency_code
          )
          returning id into inventory_account_id;
          exit;
        end if;
      end loop;
    end if;

    if inventory_account_id is null then
      raise exception
        'INVENTORY_ASSET_ACCOUNT_CODE_UNAVAILABLE:%:%',
        context_row.organization_id,
        context_row.entity_id;
    end if;

    select account.id
      into cogs_account_id
    from public.chart_of_accounts account
    where account.organization_id = context_row.organization_id
      and account.entity_id = context_row.entity_id
      and lower(btrim(account.account_name)) in ('inventory cogs', 'cost of goods sold')
      and coalesce(account.is_active, true) = true
    order by
      case when lower(btrim(account.account_name)) = 'inventory cogs' then 0 else 1 end,
      coalesce(account.is_system, false) desc,
      account.account_code
    limit 1;

    if cogs_account_id is null then
      for candidate_code in 5900..5999 loop
        if not exists (
          select 1
          from public.chart_of_accounts account
          where account.organization_id = context_row.organization_id
            and account.entity_id = context_row.entity_id
            and account.account_code = candidate_code::text
        ) then
          insert into public.chart_of_accounts (
            organization_id,
            entity_id,
            account_code,
            account_name,
            account_category,
            normal_balance,
            is_active,
            is_system,
            currency_code
          ) values (
            context_row.organization_id,
            context_row.entity_id,
            candidate_code::text,
            'Inventory COGS',
            'COGS',
            'Debit',
            true,
            true,
            context_row.currency_code
          )
          returning id into cogs_account_id;
          exit;
        end if;
      end loop;
    end if;

    if cogs_account_id is null then
      raise exception
        'INVENTORY_COGS_ACCOUNT_CODE_UNAVAILABLE:%:%',
        context_row.organization_id,
        context_row.entity_id;
    end if;

    if not exists (
      select 1
      from public.finance_posting_rules rule
      where rule.organization_id = context_row.organization_id
        and rule.entity_id = context_row.entity_id
        and upper(btrim(rule.event_type)) = 'INVENTORY_CONSUMPTION'
        and upper(btrim(rule.source_module)) = 'INVENTORY'
        and upper(btrim(coalesce(rule.status, 'ACTIVE'))) = 'ACTIVE'
    ) then
      insert into public.finance_posting_rules (
        organization_id,
        entity_id,
        name,
        event_type,
        source_module,
        debit_account_id,
        credit_account_id,
        effective_from,
        priority,
        status
      ) values (
        context_row.organization_id,
        context_row.entity_id,
        'Inventory Consumption',
        'INVENTORY_CONSUMPTION',
        'INVENTORY',
        cogs_account_id,
        inventory_account_id,
        current_date,
        100,
        'ACTIVE'
      );
    end if;
  end loop;
end
$$;
