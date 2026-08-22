begin;

alter table public.finance_fx_revaluation_runs
  add column if not exists account_ids jsonb not null default '[]'::jsonb,
  add column if not exists closing_exchange_rate numeric(20,10),
  add column if not exists functional_currency text,
  add column if not exists journal_entry_id uuid,
  add column if not exists total_adjustment numeric(20,4) not null default 0,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='finance_fx_revaluation_runs_journal_fk'
      and conrelid='public.finance_fx_revaluation_runs'::regclass
  ) then
    alter table public.finance_fx_revaluation_runs
      add constraint finance_fx_revaluation_runs_journal_fk
      foreign key (journal_entry_id)
      references public.journal_entries(id)
      on delete restrict;
  end if;
end $$;

create unique index if not exists finance_fx_revaluation_runs_journal_uidx
  on public.finance_fx_revaluation_runs(journal_entry_id)
  where journal_entry_id is not null;

create or replace function public.finance_validate_fx_revaluation_run()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_value jsonb;
  v_account_id uuid;
begin
  new.currency_code := upper(btrim(coalesce(new.currency_code,'')));
  new.rate_source := btrim(coalesce(new.rate_source,''));

  if new.organization_id is null or new.entity_id is null then raise exception 'FX Revaluation scope required'; end if;
  if new.revaluation_date is null then raise exception 'FX Revaluation Date required'; end if;
  if new.currency_code='' then raise exception 'FX Revaluation Currency required'; end if;
  if new.unrealized_gain_account_id is null or new.unrealized_loss_account_id is null then
    raise exception 'FX Unrealised Gain and Loss Accounts required';
  end if;
  if new.unrealized_gain_account_id=new.unrealized_loss_account_id then
    raise exception 'FX Gain and Loss Accounts must be different';
  end if;
  if new.account_ids is null or jsonb_typeof(new.account_ids)<>'array' or jsonb_array_length(new.account_ids)=0 then
    raise exception 'FX Revaluation requires at least one monetary Account';
  end if;

  perform 1 from public.legal_entities where id=new.entity_id and organization_id=new.organization_id;
  if not found then raise exception 'FX Revaluation Legal Entity not found in organisation'; end if;

  perform 1 from public.chart_of_accounts
  where id=new.unrealized_gain_account_id and organization_id=new.organization_id and entity_id=new.entity_id and coalesce(is_active,true)=true;
  if not found then raise exception 'FX Unrealised Gain Account is outside selected Legal Entity or inactive'; end if;

  perform 1 from public.chart_of_accounts
  where id=new.unrealized_loss_account_id and organization_id=new.organization_id and entity_id=new.entity_id and coalesce(is_active,true)=true;
  if not found then raise exception 'FX Unrealised Loss Account is outside selected Legal Entity or inactive'; end if;

  for v_value in select value from jsonb_array_elements(new.account_ids)
  loop
    begin
      v_account_id := nullif(btrim(coalesce(v_value->>'account_id', trim(both '"' from v_value::text))), '')::uuid;
    exception when others then
      raise exception 'FX Revaluation contains an invalid Account';
    end;

    perform 1 from public.chart_of_accounts
    where id=v_account_id
      and organization_id=new.organization_id
      and entity_id=new.entity_id
      and coalesce(is_active,true)=true
      and upper(coalesce(account_type,'')) in ('ASSET','CURRENT_ASSET','CASH','LIABILITY');
    if not found then
      raise exception 'FX Revaluation Account is outside selected Legal Entity, inactive, or not a monetary balance-sheet type';
    end if;
  end loop;

  if tg_op='INSERT' then
    new.status := 'DRAFT';
    new.closing_exchange_rate := null;
    new.functional_currency := null;
    new.journal_entry_id := null;
    new.total_adjustment := 0;
    new.completed_at := null;
  elsif upper(coalesce(old.status,'DRAFT')) in ('COMPLETED','NO_ADJUSTMENT') then
    if new.revaluation_date is distinct from old.revaluation_date
       or new.currency_code is distinct from old.currency_code
       or new.account_ids is distinct from old.account_ids
       or new.unrealized_gain_account_id is distinct from old.unrealized_gain_account_id
       or new.unrealized_loss_account_id is distinct from old.unrealized_loss_account_id
    then
      raise exception 'Completed FX Revaluation accounting terms are immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists finance_fx_revaluation_run_validate on public.finance_fx_revaluation_runs;
create trigger finance_fx_revaluation_run_validate
before insert or update on public.finance_fx_revaluation_runs
for each row execute function public.finance_validate_fx_revaluation_run();

revoke all on function public.finance_validate_fx_revaluation_run() from public;
revoke all on function public.finance_validate_fx_revaluation_run() from anon;
revoke all on function public.finance_validate_fx_revaluation_run() from authenticated;

commit;
