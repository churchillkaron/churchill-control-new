begin;

create unique index if not exists wallet_transactions_reference_type_unique
on public.wallet_transactions (
  organization_id,
  reference,
  type
)
where reference is not null;

create or replace function public.enforce_wallet_reference_transition_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  opposing_type text;
begin
  if new.reference is null then
    return new;
  end if;

  if new.type = 'CHARGE' then
    opposing_type := 'RELEASE';
  elsif new.type = 'RELEASE' then
    opposing_type := 'CHARGE';
  else
    return new;
  end if;

  if exists (
    select 1
    from public.wallet_transactions existing
    where existing.organization_id = new.organization_id
      and existing.reference = new.reference
      and existing.type = opposing_type
  ) then
    raise exception using
      errcode = '23514',
      message = 'WALLET_REFERENCE_ALREADY_FINALIZED_AS_' || opposing_type,
      detail = 'A wallet reference may finalize as CHARGE or RELEASE, never both.';
  end if;

  return new;
end;
$$;

drop trigger if exists wallet_reference_transition_integrity
on public.wallet_transactions;

create trigger wallet_reference_transition_integrity
before insert or update of organization_id, reference, type
on public.wallet_transactions
for each row
execute function public.enforce_wallet_reference_transition_integrity();

commit;
