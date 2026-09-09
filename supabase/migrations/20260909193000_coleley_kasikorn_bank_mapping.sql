-- Reconcile Cole Ley Co., Ltd. legacy receiving-bank identity into Avantiqo Finance.
-- The legacy account number is intentionally not persisted here; bank_accounts.account_number is nullable.
-- This migration is idempotent and preserves the migrated 1100 Accounts Receivable account.

do $$
declare
  v_org uuid := '9550b843-b83c-4d15-b02d-a0b5ca23346e';
  v_entity uuid := 'fb6f39e3-1c93-456f-913c-4c4a4f965b4e';
  v_finance_account uuid;
begin
  insert into public.chart_of_accounts (
    account_code,
    account_name,
    account_category,
    account_type,
    normal_balance,
    is_active,
    is_system,
    organization_id,
    entity_id,
    currency_code
  )
  values (
    '1110',
    'Kasikorn Bank',
    'Assets',
    'ASSET',
    'Debit',
    true,
    false,
    v_org,
    v_entity,
    'THB'
  )
  on conflict (organization_id, entity_id, account_code) do nothing;

  select id
  into v_finance_account
  from public.chart_of_accounts
  where organization_id = v_org
    and entity_id = v_entity
    and account_code = '1110';

  if v_finance_account is null then
    raise exception 'Cole Ley Kasikorn GL account 1110 was not created or found';
  end if;

  if exists (
    select 1
    from public.chart_of_accounts
    where id = v_finance_account
      and (
        account_name <> 'Kasikorn Bank'
        or account_category <> 'Assets'
        or coalesce(account_type, '') <> 'ASSET'
      )
  ) then
    raise exception 'Cole Ley account 1110 is occupied by an incompatible chart account';
  end if;

  if not exists (
    select 1
    from public.bank_accounts
    where organization_id = v_org
      and entity_id = v_entity
      and lower(bank_name) = lower('Kasikorn Bank')
      and lower(account_name) = lower('Cole Ley Co., Ltd.')
  ) then
    insert into public.bank_accounts (
      organization_id,
      entity_id,
      bank_name,
      account_name,
      account_number,
      currency,
      currency_code,
      is_default,
      active,
      finance_account_id
    )
    values (
      v_org,
      v_entity,
      'Kasikorn Bank',
      'Cole Ley Co., Ltd.',
      null,
      'THB',
      'THB',
      true,
      true,
      v_finance_account
    );
  else
    update public.bank_accounts
    set finance_account_id = v_finance_account,
        currency = coalesce(currency, 'THB'),
        currency_code = coalesce(currency_code, 'THB'),
        active = true,
        is_default = true,
        updated_at = now()
    where organization_id = v_org
      and entity_id = v_entity
      and lower(bank_name) = lower('Kasikorn Bank')
      and lower(account_name) = lower('Cole Ley Co., Ltd.');
  end if;
end $$;
