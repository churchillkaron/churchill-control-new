begin;

alter table public.accounting_practice_billing_batches
  add column if not exists invoice_lease_token uuid,
  add column if not exists invoice_lease_expires_at timestamptz;

create index if not exists accounting_practice_billing_batches_invoice_lease_idx
  on public.accounting_practice_billing_batches (accounting_firm_id, invoice_lease_expires_at)
  where invoice_lease_token is not null;

create or replace function public.acquire_accounting_practice_billing_invoice_lease(
  p_accounting_firm_id uuid,
  p_batch_id uuid,
  p_actor_id uuid,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.accounting_practice_billing_batches%rowtype;
  v_token uuid;
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 300), 900));
begin
  select * into v_batch
  from public.accounting_practice_billing_batches
  where id = p_batch_id
    and accounting_firm_id = p_accounting_firm_id
  for update;

  if not found then raise exception 'PRACTICE_BILLING_BATCH_NOT_FOUND'; end if;

  if v_batch.status = 'INVOICED' then
    return jsonb_build_object(
      'state', 'INVOICED',
      'billing_batch', to_jsonb(v_batch),
      'invoice_id', v_batch.invoice_id
    );
  end if;

  if v_batch.status not in ('PREPARING','FAILED') then
    raise exception 'PRACTICE_BILLING_BATCH_NOT_LEASABLE';
  end if;

  if v_batch.invoice_lease_token is not null
     and v_batch.invoice_lease_expires_at is not null
     and v_batch.invoice_lease_expires_at > now() then
    return jsonb_build_object(
      'state', 'BUSY',
      'billing_batch', to_jsonb(v_batch) - 'invoice_lease_token',
      'retry_after', v_batch.invoice_lease_expires_at
    );
  end if;

  v_token := gen_random_uuid();

  update public.accounting_practice_billing_batches
  set status = 'PREPARING',
      prepared_by = coalesce(p_actor_id, prepared_by),
      invoice_lease_token = v_token,
      invoice_lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      failure_reason = null,
      updated_at = now()
  where id = v_batch.id
    and accounting_firm_id = p_accounting_firm_id
  returning * into v_batch;

  return jsonb_build_object(
    'state', 'ACQUIRED',
    'billing_batch', to_jsonb(v_batch) - 'invoice_lease_token',
    'lease_token', v_token,
    'lease_expires_at', v_batch.invoice_lease_expires_at
  );
end;
$$;

create or replace function public.fail_accounting_practice_billing_invoice_lease(
  p_accounting_firm_id uuid,
  p_batch_id uuid,
  p_lease_token uuid,
  p_failure_reason text
) returns public.accounting_practice_billing_batches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.accounting_practice_billing_batches%rowtype;
begin
  select * into v_batch
  from public.accounting_practice_billing_batches
  where id = p_batch_id
    and accounting_firm_id = p_accounting_firm_id
  for update;

  if not found then raise exception 'PRACTICE_BILLING_BATCH_NOT_FOUND'; end if;
  if v_batch.status = 'INVOICED' then return v_batch; end if;
  if v_batch.invoice_lease_token is distinct from p_lease_token then
    raise exception 'PRACTICE_BILLING_INVOICE_LEASE_MISMATCH';
  end if;

  update public.accounting_practice_billing_batches
  set status = 'FAILED',
      failure_reason = left(coalesce(nullif(trim(p_failure_reason), ''), 'Practice billing invoice attempt failed'), 1000),
      invoice_lease_token = null,
      invoice_lease_expires_at = null,
      updated_at = now()
  where id = v_batch.id
    and accounting_firm_id = p_accounting_firm_id
  returning * into v_batch;

  return v_batch;
end;
$$;

create or replace function public.clear_accounting_practice_billing_invoice_lease_on_terminal()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status in ('INVOICED','VOID') then
    new.invoice_lease_token := null;
    new.invoice_lease_expires_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists accounting_practice_billing_terminal_lease_clear
  on public.accounting_practice_billing_batches;

create trigger accounting_practice_billing_terminal_lease_clear
before update of status on public.accounting_practice_billing_batches
for each row
execute function public.clear_accounting_practice_billing_invoice_lease_on_terminal();

revoke all on function public.acquire_accounting_practice_billing_invoice_lease(uuid,uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.acquire_accounting_practice_billing_invoice_lease(uuid,uuid,uuid,integer)
  to service_role;

revoke all on function public.fail_accounting_practice_billing_invoice_lease(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.fail_accounting_practice_billing_invoice_lease(uuid,uuid,uuid,text)
  to service_role;

revoke all on function public.clear_accounting_practice_billing_invoice_lease_on_terminal()
  from public, anon, authenticated;
grant execute on function public.clear_accounting_practice_billing_invoice_lease_on_terminal()
  to service_role;

commit;
