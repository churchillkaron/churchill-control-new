create table if not exists public.payroll_liability_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  payroll_period text not null,
  liability_type text not null,
  amount numeric(18,2) not null,
  currency text not null,
  status text not null default 'PREPARED',
  payment_reference text,
  finance_journal_entry_id uuid,
  prepared_by uuid not null,
  prepared_at timestamptz not null default now(),
  paid_by uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_liability_settlements_entity_fkey foreign key (entity_id) references public.legal_entities(id) on delete restrict,
  constraint payroll_liability_settlements_prepared_by_fkey foreign key (prepared_by) references public.staff_accounts(id) on delete restrict,
  constraint payroll_liability_settlements_paid_by_fkey foreign key (paid_by) references public.staff_accounts(id) on delete restrict,
  constraint payroll_liability_settlements_period_check check (payroll_period ~ '^\d{4}-\d{2}$'),
  constraint payroll_liability_settlements_type_check check (liability_type in ('WITHHOLDING_TAX','SOCIAL_SECURITY','EMPLOYEE_DEDUCTION')),
  constraint payroll_liability_settlements_amount_check check (amount > 0),
  constraint payroll_liability_settlements_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payroll_liability_settlements_status_check check (status in ('PREPARED','PAID','CANCELLED')),
  constraint payroll_liability_settlements_paid_check check ((status = 'PAID' and paid_by is not null and paid_at is not null and payment_reference is not null and finance_journal_entry_id is not null) or status <> 'PAID')
);

create unique index if not exists payroll_liability_settlements_active_unique
  on public.payroll_liability_settlements (organization_id, entity_id, payroll_period, liability_type)
  where status in ('PREPARED','PAID');
create index if not exists payroll_liability_settlements_scope_idx
  on public.payroll_liability_settlements (organization_id, entity_id, payroll_period, status);

create or replace function public.validate_payroll_liability_settlement_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entity_org uuid;
  v_preparer_org uuid;
  v_payer_org uuid;
begin
  select organization_id into v_entity_org from public.legal_entities where id = new.entity_id and is_active is true;
  if not found or v_entity_org is distinct from new.organization_id then
    raise exception using errcode='23514', message='Payroll liability legal entity does not belong to organization';
  end if;
  select active_organization_id into v_preparer_org from public.staff_accounts where id = new.prepared_by and active is true;
  if not found or v_preparer_org is distinct from new.organization_id then
    raise exception using errcode='23514', message='Payroll liability preparer does not belong to organization';
  end if;
  if new.paid_by is not null then
    select active_organization_id into v_payer_org from public.staff_accounts where id = new.paid_by and active is true;
    if not found or v_payer_org is distinct from new.organization_id then
      raise exception using errcode='23514', message='Payroll liability payer does not belong to organization';
    end if;
  end if;
  new.liability_type := upper(btrim(new.liability_type));
  new.currency := upper(btrim(new.currency));
  new.status := upper(btrim(new.status));
  new.payment_reference := nullif(btrim(coalesce(new.payment_reference,'')), '');
  return new;
end;
$$;

drop trigger if exists payroll_liability_settlements_validate_scope on public.payroll_liability_settlements;
create trigger payroll_liability_settlements_validate_scope
before insert or update of organization_id,entity_id,liability_type,currency,status,prepared_by,paid_by,payment_reference
on public.payroll_liability_settlements
for each row execute function public.validate_payroll_liability_settlement_scope();
drop trigger if exists payroll_liability_settlements_set_updated_at on public.payroll_liability_settlements;
create trigger payroll_liability_settlements_set_updated_at
before update on public.payroll_liability_settlements
for each row execute function public.set_updated_at();

alter table public.payroll_liability_settlements enable row level security;
drop policy if exists payroll_liability_settlements_read on public.payroll_liability_settlements;
create policy payroll_liability_settlements_read
on public.payroll_liability_settlements
for select to authenticated
using (public.can_manage_organization(organization_id));
revoke insert,update,delete on public.payroll_liability_settlements from anon,authenticated;
grant select on public.payroll_liability_settlements to authenticated;
grant select,insert,update on public.payroll_liability_settlements to service_role;
revoke all on function public.validate_payroll_liability_settlement_scope() from public,anon,authenticated;
