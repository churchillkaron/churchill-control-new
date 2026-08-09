alter table public.customer_statement_runs
  add column if not exists party_id uuid,
  add column if not exists credit_note_total numeric not null default 0,
  add column if not exists credit_application_total numeric not null default 0,
  add column if not exists available_credit numeric not null default 0,
  add column if not exists unapplied_cash numeric not null default 0,
  add column if not exists net_balance numeric not null default 0;

update public.customer_statement_runs
set party_id = customer_id
where party_id is null;

alter table public.customer_statement_runs
  alter column party_id set not null;

alter table public.customer_statement_runs
  drop constraint if exists customer_statement_runs_org_party_fkey;
alter table public.customer_statement_runs
  add constraint customer_statement_runs_org_party_fkey
  foreign key (organization_id, party_id)
  references public.parties(organization_id, id)
  on delete restrict;

create index if not exists customer_statement_runs_org_entity_party_idx
  on public.customer_statement_runs(organization_id, entity_id, party_id, statement_date desc);

alter table public.customer_collection_cases
  add column if not exists party_id uuid,
  add column if not exists opened_by uuid,
  add column if not exists last_activity_at timestamptz;

update public.customer_collection_cases
set party_id = customer_id
where party_id is null;

alter table public.customer_collection_cases
  alter column party_id set not null;

alter table public.customer_collection_cases
  drop constraint if exists customer_collection_cases_org_party_fkey;
alter table public.customer_collection_cases
  add constraint customer_collection_cases_org_party_fkey
  foreign key (organization_id, party_id)
  references public.parties(organization_id, id)
  on delete restrict;

create index if not exists customer_collection_cases_org_entity_party_idx
  on public.customer_collection_cases(organization_id, entity_id, party_id, status, next_follow_up_at);

alter table public.customer_collection_activities
  add column if not exists party_id uuid;

update public.customer_collection_activities
set party_id = customer_id
where party_id is null;

alter table public.customer_collection_activities
  alter column party_id set not null;

alter table public.customer_collection_activities
  drop constraint if exists customer_collection_activities_org_party_fkey;
alter table public.customer_collection_activities
  add constraint customer_collection_activities_org_party_fkey
  foreign key (organization_id, party_id)
  references public.parties(organization_id, id)
  on delete restrict;

create index if not exists customer_collection_activities_org_entity_party_idx
  on public.customer_collection_activities(organization_id, entity_id, party_id, created_at desc);

alter table public.customer_loyalty_accounts
  alter column organization_id set not null,
  alter column party_id set not null;

alter table public.customer_loyalty_accounts
  drop constraint if exists customer_loyalty_accounts_org_party_fkey;
alter table public.customer_loyalty_accounts
  add constraint customer_loyalty_accounts_org_party_fkey
  foreign key (organization_id, party_id)
  references public.parties(organization_id, id)
  on delete cascade;

create unique index if not exists customer_loyalty_accounts_org_party_uidx
  on public.customer_loyalty_accounts(organization_id, party_id);

create index if not exists customer_loyalty_accounts_org_tier_idx
  on public.customer_loyalty_accounts(organization_id, tier);

drop function if exists public.update_customer_loyalty();

create or replace function public.finance_get_customer_account_party(
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_as_of_date date default current_date
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_party public.parties%rowtype;
  v_profile public.customer_profiles%rowtype;
  v_balances jsonb := '[]'::jsonb;
  v_transactions jsonb := '[]'::jsonb;
  v_collections jsonb := '[]'::jsonb;
  v_statements jsonb := '[]'::jsonb;
  v_loyalty jsonb := '{}'::jsonb;
begin
  if p_organization_id is null or p_entity_id is null or p_party_id is null then
    raise exception 'organization_id, entity_id and party_id required';
  end if;

  select * into v_party
  from public.parties
  where organization_id = p_organization_id
    and id = p_party_id;
  if not found then
    raise exception 'Customer party not found in organization';
  end if;

  if not exists (
    select 1
    from public.party_relationships pr
    where pr.organization_id = p_organization_id
      and pr.party_id = p_party_id
      and lower(pr.relationship_type) = 'customer'
      and lower(coalesce(pr.status, 'active')) <> 'archived'
  ) then
    raise exception 'Party is not an active customer';
  end if;

  select * into v_profile
  from public.customer_profiles
  where organization_id = p_organization_id
    and party_id = p_party_id
  limit 1;

  with currencies as (
    select distinct upper(coalesce(ci.currency_code, '')) as currency_code
    from public.accounts_receivable ar
    join public.customer_invoices ci on ci.id = ar.customer_invoice_id
    where ar.organization_id = p_organization_id
      and ar.entity_id = p_entity_id
      and ar.party_id = p_party_id
      and upper(coalesce(ci.currency_code, '')) <> ''
    union
    select distinct upper(currency_code)
    from public.finance_customer_credits
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and party_id = p_party_id
    union
    select distinct upper(currency_code)
    from public.finance_customer_unapplied_cash
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and party_id = p_party_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'currency_code', c.currency_code,
      'receivable_outstanding', coalesce((
        select sum(ar.outstanding_balance)
        from public.accounts_receivable ar
        join public.customer_invoices ci on ci.id = ar.customer_invoice_id
        where ar.organization_id = p_organization_id
          and ar.entity_id = p_entity_id
          and ar.party_id = p_party_id
          and upper(coalesce(ci.currency_code, '')) = c.currency_code
      ), 0),
      'overdue', coalesce((
        select sum(ar.outstanding_balance)
        from public.accounts_receivable ar
        join public.customer_invoices ci on ci.id = ar.customer_invoice_id
        where ar.organization_id = p_organization_id
          and ar.entity_id = p_entity_id
          and ar.party_id = p_party_id
          and upper(coalesce(ci.currency_code, '')) = c.currency_code
          and ar.outstanding_balance > 0
          and ar.due_date < p_as_of_date
      ), 0),
      'aging', jsonb_build_object(
        'current', coalesce((
          select sum(ar.outstanding_balance)
          from public.accounts_receivable ar
          join public.customer_invoices ci on ci.id = ar.customer_invoice_id
          where ar.organization_id = p_organization_id
            and ar.entity_id = p_entity_id
            and ar.party_id = p_party_id
            and upper(coalesce(ci.currency_code, '')) = c.currency_code
            and ar.outstanding_balance > 0
            and ar.due_date >= p_as_of_date
        ), 0),
        '1_30', coalesce((
          select sum(ar.outstanding_balance)
          from public.accounts_receivable ar
          join public.customer_invoices ci on ci.id = ar.customer_invoice_id
          where ar.organization_id = p_organization_id
            and ar.entity_id = p_entity_id
            and ar.party_id = p_party_id
            and upper(coalesce(ci.currency_code, '')) = c.currency_code
            and ar.outstanding_balance > 0
            and p_as_of_date - ar.due_date between 1 and 30
        ), 0),
        '31_60', coalesce((
          select sum(ar.outstanding_balance)
          from public.accounts_receivable ar
          join public.customer_invoices ci on ci.id = ar.customer_invoice_id
          where ar.organization_id = p_organization_id
            and ar.entity_id = p_entity_id
            and ar.party_id = p_party_id
            and upper(coalesce(ci.currency_code, '')) = c.currency_code
            and ar.outstanding_balance > 0
            and p_as_of_date - ar.due_date between 31 and 60
        ), 0),
        '61_90', coalesce((
          select sum(ar.outstanding_balance)
          from public.accounts_receivable ar
          join public.customer_invoices ci on ci.id = ar.customer_invoice_id
          where ar.organization_id = p_organization_id
            and ar.entity_id = p_entity_id
            and ar.party_id = p_party_id
            and upper(coalesce(ci.currency_code, '')) = c.currency_code
            and ar.outstanding_balance > 0
            and p_as_of_date - ar.due_date between 61 and 90
        ), 0),
        '91_plus', coalesce((
          select sum(ar.outstanding_balance)
          from public.accounts_receivable ar
          join public.customer_invoices ci on ci.id = ar.customer_invoice_id
          where ar.organization_id = p_organization_id
            and ar.entity_id = p_entity_id
            and ar.party_id = p_party_id
            and upper(coalesce(ci.currency_code, '')) = c.currency_code
            and ar.outstanding_balance > 0
            and p_as_of_date - ar.due_date >= 91
        ), 0)
      ),
      'available_credit', coalesce((
        select sum(fc.available_amount)
        from public.finance_customer_credits fc
        where fc.organization_id = p_organization_id
          and fc.entity_id = p_entity_id
          and fc.party_id = p_party_id
          and upper(fc.currency_code) = c.currency_code
      ), 0),
      'unapplied_cash', coalesce((
        select sum(uc.amount)
        from public.finance_customer_unapplied_cash uc
        where uc.organization_id = p_organization_id
          and uc.entity_id = p_entity_id
          and uc.party_id = p_party_id
          and upper(uc.currency_code) = c.currency_code
          and uc.refunded_at is null
      ), 0),
      'net_customer_position',
        coalesce((
          select sum(ar.outstanding_balance)
          from public.accounts_receivable ar
          join public.customer_invoices ci on ci.id = ar.customer_invoice_id
          where ar.organization_id = p_organization_id
            and ar.entity_id = p_entity_id
            and ar.party_id = p_party_id
            and upper(coalesce(ci.currency_code, '')) = c.currency_code
        ), 0)
        - coalesce((
          select sum(fc.available_amount)
          from public.finance_customer_credits fc
          where fc.organization_id = p_organization_id
            and fc.entity_id = p_entity_id
            and fc.party_id = p_party_id
            and upper(fc.currency_code) = c.currency_code
        ), 0)
        - coalesce((
          select sum(uc.amount)
          from public.finance_customer_unapplied_cash uc
          where uc.organization_id = p_organization_id
            and uc.entity_id = p_entity_id
            and uc.party_id = p_party_id
            and upper(uc.currency_code) = c.currency_code
            and uc.refunded_at is null
        ), 0)
    ) order by c.currency_code
  ), '[]'::jsonb)
  into v_balances
  from currencies c;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.event_at desc, t.event_type, t.reference), '[]'::jsonb)
  into v_transactions
  from (
    select
      ci.invoice_date::timestamptz as event_at,
      upper(coalesce(ci.document_type, 'INVOICE')) as event_type,
      ci.invoice_number as reference,
      ci.id as document_id,
      upper(coalesce(ci.currency_code, '')) as currency_code,
      ci.total_amount as amount,
      ci.outstanding_balance as outstanding_amount,
      ci.status,
      ci.due_date,
      ci.source_document_type,
      ci.source_document_id
    from public.customer_invoices ci
    where ci.organization_id = p_organization_id
      and ci.entity_id = p_entity_id
      and ci.party_id = p_party_id
      and ci.invoice_date <= p_as_of_date

    union all

    select
      cp.payment_date as event_at,
      'PAYMENT'::text as event_type,
      coalesce(cp.payment_number, cp.reference_number, cp.id::text) as reference,
      cp.id as document_id,
      upper(coalesce(cp.currency_code, '')) as currency_code,
      cp.amount as amount,
      cp.unapplied_amount as outstanding_amount,
      cp.status,
      null::date as due_date,
      'CUSTOMER_PAYMENT'::text as source_document_type,
      cp.customer_invoice_id as source_document_id
    from public.customer_payments cp
    where cp.organization_id = p_organization_id
      and cp.entity_id = p_entity_id
      and cp.party_id = p_party_id
      and cp.payment_date::date <= p_as_of_date

    union all

    select
      ca.applied_at as event_at,
      'CREDIT_APPLICATION'::text as event_type,
      ca.idempotency_key as reference,
      ca.id as document_id,
      upper(fc.currency_code) as currency_code,
      ca.amount as amount,
      ca.balance_after as outstanding_amount,
      case when ca.reversed_at is null then 'APPLIED' else 'REVERSED' end as status,
      null::date as due_date,
      'CUSTOMER_INVOICE'::text as source_document_type,
      ca.target_invoice_id as source_document_id
    from public.finance_customer_credit_applications ca
    join public.finance_customer_credits fc on fc.id = ca.customer_credit_id
    where ca.organization_id = p_organization_id
      and ca.entity_id = p_entity_id
      and ca.party_id = p_party_id
      and ca.applied_at::date <= p_as_of_date

    union all

    select
      cr.refunded_at as event_at,
      'CREDIT_REFUND'::text as event_type,
      coalesce(cr.reference_number, cr.id::text) as reference,
      cr.id as document_id,
      upper(cr.currency_code) as currency_code,
      cr.amount as amount,
      0::numeric as outstanding_amount,
      'REFUNDED'::text as status,
      null::date as due_date,
      'CUSTOMER_CREDIT'::text as source_document_type,
      cr.customer_credit_id as source_document_id
    from public.finance_customer_credit_refunds cr
    where cr.organization_id = p_organization_id
      and cr.entity_id = p_entity_id
      and cr.party_id = p_party_id
      and cr.refunded_at::date <= p_as_of_date
  ) t;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
  into v_collections
  from public.customer_collection_cases c
  where c.organization_id = p_organization_id
    and c.entity_id = p_entity_id
    and c.party_id = p_party_id;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.statement_date desc), '[]'::jsonb)
  into v_statements
  from (
    select *
    from public.customer_statement_runs s
    where s.organization_id = p_organization_id
      and s.entity_id = p_entity_id
      and s.party_id = p_party_id
    order by s.statement_date desc
    limit 12
  ) s;

  select coalesce(to_jsonb(l), '{}'::jsonb)
  into v_loyalty
  from public.customer_loyalty_accounts l
  where l.organization_id = p_organization_id
    and l.party_id = p_party_id
  limit 1;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'entity_id', p_entity_id,
    'party_id', p_party_id,
    'as_of_date', p_as_of_date,
    'customer', jsonb_build_object(
      'party_id', v_party.id,
      'display_name', v_party.display_name,
      'legal_name', v_party.legal_name,
      'email', v_party.email,
      'phone', v_party.phone,
      'tax_id', v_party.tax_id,
      'customer_number', v_profile.customer_number,
      'credit_limit', v_profile.credit_limit,
      'payment_terms', v_profile.payment_terms,
      'preferred_currency', v_profile.preferred_currency,
      'status', coalesce(v_profile.status, v_party.status)
    ),
    'balances', v_balances,
    'transactions', v_transactions,
    'collections', v_collections,
    'recent_statements', v_statements,
    'loyalty', v_loyalty
  );
end;
$$;

create or replace function public.finance_generate_customer_statement_party_idempotent(
  p_statement_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_statement_date date,
  p_period_start date,
  p_period_end date,
  p_currency_code text,
  p_generated_by uuid,
  p_idempotency_key text,
  p_prefix text default 'STAT'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency text;
  v_request_hash text;
  v_existing jsonb;
  v_statement_number text;
  v_opening numeric := 0;
  v_invoice_total numeric := 0;
  v_payment_total numeric := 0;
  v_credit_note_total numeric := 0;
  v_credit_application_total numeric := 0;
  v_closing numeric := 0;
  v_available_credit numeric := 0;
  v_unapplied_cash numeric := 0;
  v_net numeric := 0;
  v_overdue numeric := 0;
  v_snapshot jsonb;
  v_result jsonb;
begin
  if p_statement_id is null or p_organization_id is null or p_entity_id is null or p_party_id is null then
    raise exception 'statement_id, organization_id, entity_id and party_id required';
  end if;
  if p_statement_date is null or p_period_start is null or p_period_end is null then
    raise exception 'statement_date, period_start and period_end required';
  end if;
  if p_period_start > p_period_end then
    raise exception 'Statement period start must not be after period end';
  end if;
  v_currency := upper(nullif(btrim(p_currency_code), ''));
  if v_currency is null then raise exception 'currency_code required'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;

  if not exists (
    select 1 from public.parties p
    where p.organization_id = p_organization_id and p.id = p_party_id
  ) then raise exception 'Customer party not found'; end if;

  v_request_hash := md5(concat_ws('|', p_statement_id::text, p_party_id::text, p_statement_date::text, p_period_start::text, p_period_end::text, v_currency));
  v_existing := public.finance_claim_idempotency(p_organization_id, p_entity_id, 'CUSTOMER_STATEMENT_PARTY', btrim(p_idempotency_key), v_request_hash, p_statement_id);
  if v_existing is not null then return v_existing; end if;

  select coalesce(sum(ci.total_amount), 0)
  into v_opening
  from public.customer_invoices ci
  where ci.organization_id = p_organization_id
    and ci.entity_id = p_entity_id
    and ci.party_id = p_party_id
    and upper(coalesce(ci.currency_code, '')) = v_currency
    and upper(coalesce(ci.document_type, 'INVOICE')) = 'INVOICE'
    and ci.invoice_date < p_period_start
    and ci.posted_at is not null
    and (ci.cancelled_at is null or ci.cancelled_at::date >= p_period_start);

  v_opening := v_opening - coalesce((
    select sum(a.allocated_amount)
    from public.finance_customer_payment_allocations a
    join public.customer_payments p on p.id = a.customer_payment_id
    where a.organization_id = p_organization_id
      and a.entity_id = p_entity_id
      and a.party_id = p_party_id
      and upper(coalesce(p.currency_code, '')) = v_currency
      and a.applied_at::date < p_period_start
      and (a.reversed_at is null or a.reversed_at::date >= p_period_start)
  ), 0);

  v_opening := v_opening - coalesce((
    select sum(a.amount)
    from public.finance_customer_credit_applications a
    join public.finance_customer_credits c on c.id = a.customer_credit_id
    where a.organization_id = p_organization_id
      and a.entity_id = p_entity_id
      and a.party_id = p_party_id
      and upper(c.currency_code) = v_currency
      and a.applied_at::date < p_period_start
      and (a.reversed_at is null or a.reversed_at::date >= p_period_start)
  ), 0);

  select coalesce(sum(ci.total_amount), 0)
  into v_invoice_total
  from public.customer_invoices ci
  where ci.organization_id = p_organization_id
    and ci.entity_id = p_entity_id
    and ci.party_id = p_party_id
    and upper(coalesce(ci.currency_code, '')) = v_currency
    and upper(coalesce(ci.document_type, 'INVOICE')) = 'INVOICE'
    and ci.invoice_date between p_period_start and p_period_end
    and ci.posted_at is not null
    and (ci.cancelled_at is null or ci.cancelled_at::date > p_period_end);

  select coalesce(sum(a.allocated_amount), 0)
  into v_payment_total
  from public.finance_customer_payment_allocations a
  join public.customer_payments p on p.id = a.customer_payment_id
  where a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and a.party_id = p_party_id
    and upper(coalesce(p.currency_code, '')) = v_currency
    and a.applied_at::date between p_period_start and p_period_end
    and (a.reversed_at is null or a.reversed_at::date > p_period_end);

  select coalesce(sum(ci.total_amount), 0)
  into v_credit_note_total
  from public.customer_invoices ci
  where ci.organization_id = p_organization_id
    and ci.entity_id = p_entity_id
    and ci.party_id = p_party_id
    and upper(coalesce(ci.currency_code, '')) = v_currency
    and upper(coalesce(ci.document_type, '')) = 'CREDIT_NOTE'
    and ci.invoice_date between p_period_start and p_period_end
    and upper(coalesce(ci.status, '')) not in ('CANCELLED', 'VOID');

  select coalesce(sum(a.amount), 0)
  into v_credit_application_total
  from public.finance_customer_credit_applications a
  join public.finance_customer_credits c on c.id = a.customer_credit_id
  where a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and a.party_id = p_party_id
    and upper(c.currency_code) = v_currency
    and a.applied_at::date between p_period_start and p_period_end
    and (a.reversed_at is null or a.reversed_at::date > p_period_end);

  v_closing := v_opening + v_invoice_total - v_payment_total - v_credit_application_total;

  select coalesce(sum(
    c.original_amount
    - coalesce((select sum(a.amount) from public.finance_customer_credit_applications a where a.customer_credit_id = c.id and a.applied_at::date <= p_period_end and (a.reversed_at is null or a.reversed_at::date > p_period_end)), 0)
    - coalesce((select sum(r.amount) from public.finance_customer_credit_refunds r where r.customer_credit_id = c.id and r.refunded_at::date <= p_period_end), 0)
  ), 0)
  into v_available_credit
  from public.finance_customer_credits c
  where c.organization_id = p_organization_id
    and c.entity_id = p_entity_id
    and c.party_id = p_party_id
    and upper(c.currency_code) = v_currency
    and c.created_at::date <= p_period_end;

  select coalesce(sum(uc.amount), 0)
  into v_unapplied_cash
  from public.finance_customer_unapplied_cash uc
  where uc.organization_id = p_organization_id
    and uc.entity_id = p_entity_id
    and uc.party_id = p_party_id
    and upper(uc.currency_code) = v_currency
    and uc.created_at::date <= p_period_end
    and (uc.refunded_at is null or uc.refunded_at::date > p_period_end);

  select coalesce(sum(greatest(
    ci.total_amount
    - coalesce((select sum(a.allocated_amount) from public.finance_customer_payment_allocations a where a.customer_invoice_id = ci.id and a.applied_at::date <= p_period_end and (a.reversed_at is null or a.reversed_at::date > p_period_end)), 0)
    - coalesce((select sum(ca.amount) from public.finance_customer_credit_applications ca where ca.target_invoice_id = ci.id and ca.applied_at::date <= p_period_end and (ca.reversed_at is null or ca.reversed_at::date > p_period_end)), 0),
    0
  )), 0)
  into v_overdue
  from public.customer_invoices ci
  where ci.organization_id = p_organization_id
    and ci.entity_id = p_entity_id
    and ci.party_id = p_party_id
    and upper(coalesce(ci.currency_code, '')) = v_currency
    and upper(coalesce(ci.document_type, 'INVOICE')) = 'INVOICE'
    and ci.posted_at is not null
    and ci.invoice_date <= p_period_end
    and ci.due_date < p_statement_date
    and (ci.cancelled_at is null or ci.cancelled_at::date > p_period_end);

  v_net := v_closing - v_available_credit - v_unapplied_cash;
  v_statement_number := public.next_finance_document_number(p_organization_id, p_entity_id, 'CUSTOMER_STATEMENT', coalesce(nullif(btrim(p_prefix), ''), 'STAT'), p_statement_date);
  v_snapshot := public.finance_get_customer_account_party(p_organization_id, p_entity_id, p_party_id, p_period_end);

  insert into public.customer_statement_runs(
    id, organization_id, entity_id, customer_id, party_id, statement_number,
    statement_date, period_start, period_end, currency_code,
    opening_balance, invoice_total, payment_total, credit_note_total,
    credit_application_total, closing_balance, overdue_balance,
    available_credit, unapplied_cash, net_balance,
    snapshot, status, generated_by, generated_at, created_at
  ) values (
    p_statement_id, p_organization_id, p_entity_id, p_party_id, p_party_id, v_statement_number,
    p_statement_date, p_period_start, p_period_end, v_currency,
    round(v_opening,2), round(v_invoice_total,2), round(v_payment_total,2), round(v_credit_note_total,2),
    round(v_credit_application_total,2), round(v_closing,2), round(v_overdue,2),
    round(v_available_credit,2), round(v_unapplied_cash,2), round(v_net,2),
    v_snapshot, 'GENERATED', p_generated_by, now(), now()
  );

  v_result := jsonb_build_object(
    'success', true,
    'statement_id', p_statement_id,
    'statement_number', v_statement_number,
    'party_id', p_party_id,
    'currency_code', v_currency,
    'opening_balance', round(v_opening,2),
    'invoice_total', round(v_invoice_total,2),
    'payment_total', round(v_payment_total,2),
    'credit_note_total', round(v_credit_note_total,2),
    'credit_application_total', round(v_credit_application_total,2),
    'closing_balance', round(v_closing,2),
    'available_credit', round(v_available_credit,2),
    'unapplied_cash', round(v_unapplied_cash,2),
    'net_balance', round(v_net,2),
    'overdue_balance', round(v_overdue,2)
  );

  perform public.finance_complete_idempotency(p_organization_id, p_entity_id, 'CUSTOMER_STATEMENT_PARTY', btrim(p_idempotency_key), v_result);
  return v_result;
end;
$$;

create or replace function public.finance_open_customer_collection_case_party_idempotent(
  p_case_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_customer_invoice_id uuid,
  p_accounts_receivable_id uuid,
  p_priority text,
  p_assigned_to uuid,
  p_promise_amount numeric,
  p_promise_date date,
  p_next_follow_up_at timestamptz,
  p_disputed boolean,
  p_hold_reason text,
  p_opened_by uuid,
  p_idempotency_key text,
  p_prefix text default 'COL'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_priority text;
  v_request_hash text;
  v_existing jsonb;
  v_case_number text;
  v_result jsonb;
begin
  if p_case_id is null or p_organization_id is null or p_entity_id is null or p_party_id is null then
    raise exception 'case_id, organization_id, entity_id and party_id required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;
  v_priority := upper(coalesce(nullif(btrim(p_priority), ''), 'NORMAL'));
  if v_priority not in ('LOW','NORMAL','HIGH','CRITICAL') then raise exception 'Invalid collection priority'; end if;
  if p_promise_amount is not null and p_promise_amount < 0 then raise exception 'promise_amount cannot be negative'; end if;

  if not exists (select 1 from public.parties p where p.organization_id=p_organization_id and p.id=p_party_id) then
    raise exception 'Customer party not found';
  end if;

  if p_customer_invoice_id is not null and not exists (
    select 1 from public.customer_invoices ci
    where ci.id=p_customer_invoice_id and ci.organization_id=p_organization_id and ci.entity_id=p_entity_id and ci.party_id=p_party_id
  ) then raise exception 'Customer invoice does not belong to customer scope'; end if;

  if p_accounts_receivable_id is not null and not exists (
    select 1 from public.accounts_receivable ar
    where ar.id=p_accounts_receivable_id and ar.organization_id=p_organization_id and ar.entity_id=p_entity_id and ar.party_id=p_party_id
  ) then raise exception 'Accounts receivable does not belong to customer scope'; end if;

  v_request_hash := md5(concat_ws('|',p_case_id::text,p_party_id::text,coalesce(p_customer_invoice_id::text,''),coalesce(p_accounts_receivable_id::text,''),v_priority,coalesce(p_assigned_to::text,''),coalesce(p_promise_amount::text,''),coalesce(p_promise_date::text,''),coalesce(p_next_follow_up_at::text,''),coalesce(p_disputed::text,'false'),coalesce(btrim(p_hold_reason),'')));
  v_existing := public.finance_claim_idempotency(p_organization_id,p_entity_id,'CUSTOMER_COLLECTION_CASE_PARTY',btrim(p_idempotency_key),v_request_hash,p_case_id);
  if v_existing is not null then return v_existing; end if;

  v_case_number := public.next_finance_document_number(p_organization_id,p_entity_id,'COLLECTION_CASE',coalesce(nullif(btrim(p_prefix),''),'COL'),current_date);

  insert into public.customer_collection_cases(
    id,organization_id,entity_id,customer_id,party_id,customer_invoice_id,accounts_receivable_id,
    case_number,status,priority,assigned_to,promise_amount,promise_date,next_follow_up_at,disputed,hold_reason,
    opened_by,created_at,updated_at
  ) values (
    p_case_id,p_organization_id,p_entity_id,p_party_id,p_party_id,p_customer_invoice_id,p_accounts_receivable_id,
    v_case_number,'OPEN',v_priority,p_assigned_to,p_promise_amount,p_promise_date,p_next_follow_up_at,coalesce(p_disputed,false),nullif(btrim(p_hold_reason),''),
    p_opened_by,now(),now()
  );

  v_result := jsonb_build_object('success',true,'case_id',p_case_id,'case_number',v_case_number,'party_id',p_party_id,'status','OPEN','priority',v_priority);
  perform public.finance_complete_idempotency(p_organization_id,p_entity_id,'CUSTOMER_COLLECTION_CASE_PARTY',btrim(p_idempotency_key),v_result);
  return v_result;
end;
$$;

create or replace function public.finance_record_customer_collection_activity_party_idempotent(
  p_activity_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_collection_case_id uuid,
  p_customer_invoice_id uuid,
  p_activity_type text,
  p_notes text,
  p_outcome text,
  p_follow_up_at timestamptz,
  p_promise_amount numeric,
  p_promise_date date,
  p_performed_by uuid,
  p_case_status text,
  p_disputed boolean,
  p_hold_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.customer_collection_cases%rowtype;
  v_type text;
  v_status text;
  v_request_hash text;
  v_existing jsonb;
  v_result jsonb;
begin
  if p_activity_id is null or p_organization_id is null or p_entity_id is null or p_party_id is null or p_collection_case_id is null then
    raise exception 'activity_id, organization_id, entity_id, party_id and collection_case_id required';
  end if;
  v_type := upper(nullif(btrim(p_activity_type),''));
  if v_type is null then raise exception 'activity_type required'; end if;
  if p_promise_amount is not null and p_promise_amount < 0 then raise exception 'promise_amount cannot be negative'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'idempotency_key required'; end if;

  select * into v_case
  from public.customer_collection_cases
  where id=p_collection_case_id and organization_id=p_organization_id and entity_id=p_entity_id and party_id=p_party_id
  for update;
  if not found then raise exception 'Collection case not found in customer scope'; end if;

  if p_customer_invoice_id is not null and not exists (
    select 1 from public.customer_invoices ci
    where ci.id=p_customer_invoice_id and ci.organization_id=p_organization_id and ci.entity_id=p_entity_id and ci.party_id=p_party_id
  ) then raise exception 'Customer invoice does not belong to customer scope'; end if;

  v_status := upper(coalesce(nullif(btrim(p_case_status),''),v_case.status));
  if v_status not in ('OPEN','IN_PROGRESS','PROMISE_TO_PAY','DISPUTED','ON_HOLD','CLOSED') then raise exception 'Invalid collection case status'; end if;

  v_request_hash := md5(concat_ws('|',p_activity_id::text,p_collection_case_id::text,v_type,coalesce(btrim(p_notes),''),coalesce(btrim(p_outcome),''),coalesce(p_follow_up_at::text,''),coalesce(p_promise_amount::text,''),coalesce(p_promise_date::text,''),v_status,coalesce(p_disputed::text,''),coalesce(btrim(p_hold_reason),'')));
  v_existing := public.finance_claim_idempotency(p_organization_id,p_entity_id,'CUSTOMER_COLLECTION_ACTIVITY_PARTY',btrim(p_idempotency_key),v_request_hash,p_activity_id);
  if v_existing is not null then return v_existing; end if;

  insert into public.customer_collection_activities(
    id,organization_id,entity_id,collection_case_id,customer_id,party_id,customer_invoice_id,
    activity_type,notes,outcome,follow_up_at,promise_amount,promise_date,performed_by,created_at
  ) values (
    p_activity_id,p_organization_id,p_entity_id,p_collection_case_id,p_party_id,p_party_id,coalesce(p_customer_invoice_id,v_case.customer_invoice_id),
    v_type,nullif(btrim(p_notes),''),nullif(btrim(p_outcome),''),p_follow_up_at,p_promise_amount,p_promise_date,p_performed_by,now()
  );

  update public.customer_collection_cases
  set status=v_status,
      promise_amount=coalesce(p_promise_amount,promise_amount),
      promise_date=coalesce(p_promise_date,promise_date),
      next_follow_up_at=coalesce(p_follow_up_at,next_follow_up_at),
      disputed=coalesce(p_disputed,disputed),
      hold_reason=case when p_hold_reason is not null then nullif(btrim(p_hold_reason),'') else hold_reason end,
      last_activity_at=now(),
      closed_at=case when v_status='CLOSED' then coalesce(closed_at,now()) else null end,
      updated_at=now()
  where id=p_collection_case_id and organization_id=p_organization_id and entity_id=p_entity_id and party_id=p_party_id;

  v_result := jsonb_build_object('success',true,'activity_id',p_activity_id,'case_id',p_collection_case_id,'party_id',p_party_id,'case_status',v_status,'activity_type',v_type);
  perform public.finance_complete_idempotency(p_organization_id,p_entity_id,'CUSTOMER_COLLECTION_ACTIVITY_PARTY',btrim(p_idempotency_key),v_result);
  return v_result;
end;
$$;

revoke all on function public.finance_get_customer_account_party(uuid,uuid,uuid,date) from public,anon,authenticated;
revoke all on function public.finance_generate_customer_statement_party_idempotent(uuid,uuid,uuid,uuid,date,date,date,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.finance_open_customer_collection_case_party_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,numeric,date,timestamptz,boolean,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.finance_record_customer_collection_activity_party_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,numeric,date,uuid,text,boolean,text,text) from public,anon,authenticated;

grant execute on function public.finance_get_customer_account_party(uuid,uuid,uuid,date) to service_role;
grant execute on function public.finance_generate_customer_statement_party_idempotent(uuid,uuid,uuid,uuid,date,date,date,text,uuid,text,text) to service_role;
grant execute on function public.finance_open_customer_collection_case_party_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,numeric,date,timestamptz,boolean,text,uuid,text,text) to service_role;
grant execute on function public.finance_record_customer_collection_activity_party_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,numeric,date,uuid,text,boolean,text,text) to service_role;