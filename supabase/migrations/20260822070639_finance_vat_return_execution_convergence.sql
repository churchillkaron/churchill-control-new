begin;

alter table public.finance_vat_returns
  add column if not exists calculated_at timestamptz,
  add column if not exists calculated_by uuid;

create unique index if not exists finance_vat_returns_scope_period_uidx
  on public.finance_vat_returns (organization_id, entity_id, upper(jurisdiction_code), period_start, period_end);

create or replace function public.finance_validate_vat_return()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.organization_id is null or new.entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if new.period_start is null or new.period_end is null or new.period_end < new.period_start then raise exception 'A valid VAT return period is required'; end if;
  if nullif(btrim(new.jurisdiction_code), '') is null then raise exception 'jurisdiction_code required'; end if;
  new.jurisdiction_code := upper(btrim(new.jurisdiction_code));

  if tg_op = 'INSERT' then
    perform 1 from public.legal_entities e where e.id = new.entity_id and e.organization_id = new.organization_id;
    if not found then raise exception 'Legal entity is outside organization scope'; end if;
    if nullif(btrim(new.return_number), '') is null then
      new.return_number := public.finance_next_document_number(new.organization_id,new.entity_id,'VAT_RETURN','VAT',new.period_end);
    end if;
    new.status := 'DRAFT';
    new.output_tax := 0; new.input_tax := 0; new.tax_payable := 0; new.tax_refund := 0;
    new.calculation := '{}'::jsonb; new.calculated_at := null; new.calculated_by := null;
    new.submission_reference := null; new.submitted_at := null;
  else
    if upper(coalesce(old.status, 'DRAFT')) = 'SUBMITTED' then raise exception 'Submitted VAT returns are immutable'; end if;
    if new.organization_id is distinct from old.organization_id or new.entity_id is distinct from old.entity_id
      or new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end
      or new.jurisdiction_code is distinct from old.jurisdiction_code or new.return_number is distinct from old.return_number then
      if upper(coalesce(old.status, 'DRAFT')) <> 'DRAFT' then raise exception 'VAT return scope is immutable after calculation'; end if;
    end if;
  end if;

  if upper(coalesce(new.status, 'DRAFT')) not in ('DRAFT','CALCULATED','SUBMITTED') then raise exception 'Unsupported VAT return status'; end if;
  if upper(coalesce(new.status, 'DRAFT')) = 'SUBMITTED'
    and (nullif(btrim(new.submission_reference), '') is null or new.submitted_at is null) then
    raise exception 'submission_reference and submitted_at required for submitted VAT returns';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_finance_validate_vat_return on public.finance_vat_returns;
create trigger trg_finance_validate_vat_return before insert or update on public.finance_vat_returns
for each row execute function public.finance_validate_vat_return();

create or replace function public.calculate_finance_vat_return(p_organization_id uuid,p_entity_id uuid,p_vat_return_id uuid,p_calculated_by uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_return public.finance_vat_returns%rowtype; v_currency text; v_output_tax numeric := 0; v_input_tax numeric := 0;
  v_output_documents integer := 0; v_input_documents integer := 0; v_customer_credits integer := 0;
  v_payable numeric := 0; v_refund numeric := 0;
begin
  if p_organization_id is null or p_entity_id is null or p_vat_return_id is null then raise exception 'organization_id, entity_id and vat_return_id required'; end if;
  if p_calculated_by is null then raise exception 'authenticated calculated_by required'; end if;
  select * into v_return from public.finance_vat_returns where id=p_vat_return_id and organization_id=p_organization_id and entity_id=p_entity_id for update;
  if not found then raise exception 'VAT return not found in organization and entity scope'; end if;
  if upper(coalesce(v_return.status,'DRAFT'))='SUBMITTED' then raise exception 'Submitted VAT returns cannot be recalculated'; end if;

  select coalesce(nullif(p.functional_currency,''),nullif(p.base_currency,''),nullif(e.currency,''),'THB') into v_currency
  from public.legal_entities e left join public.finance_organization_profiles p
    on p.organization_id=p_organization_id and (p.entity_id=p_entity_id or p.entity_id is null)
  where e.id=p_entity_id and e.organization_id=p_organization_id
  order by (p.entity_id=p_entity_id) desc nulls last limit 1;
  if v_currency is null then raise exception 'Functional currency could not be resolved'; end if;

  select coalesce(sum(case when upper(coalesce(ci.document_type,'INVOICE'))='CREDIT_NOTE' then -1 else 1 end
    * coalesce(ci.tax_amount,0) * coalesce(nullif(ci.exchange_rate,0),1)),0),
    count(*)::integer, count(*) filter(where upper(coalesce(ci.document_type,'INVOICE'))='CREDIT_NOTE')::integer
  into v_output_tax,v_output_documents,v_customer_credits
  from public.customer_invoices ci
  where ci.organization_id=p_organization_id and ci.entity_id=p_entity_id
    and ci.invoice_date between v_return.period_start and v_return.period_end
    and upper(coalesce(ci.tax_regime,''))=upper(v_return.jurisdiction_code)
    and exists(select 1 from public.journal_entries je where je.organization_id=p_organization_id and je.entity_id=p_entity_id
      and je.source_document_id=ci.id and upper(coalesce(je.status,''))='POSTED');

  select coalesce(sum(vil.tax_amount*coalesce(nullif(vi.exchange_rate,0),1)),0),count(distinct vi.id)::integer
  into v_input_tax,v_input_documents
  from public.vendor_invoices vi
  join public.vendor_invoice_lines vil on vil.vendor_invoice_id=vi.id and vil.organization_id=vi.organization_id and vil.entity_id=vi.entity_id
  join public.tax_rules tr on tr.id=vil.tax_code_id
  where vi.organization_id=p_organization_id and vi.entity_id=p_entity_id
    and vi.invoice_date between v_return.period_start and v_return.period_end
    and upper(coalesce(vi.status,''))='POSTED' and upper(coalesce(vi.approval_status,''))='APPROVED' and vi.journal_entry_id is not null
    and upper(tr.tax_type)='VAT' and upper(tr.tax_regime)=upper(v_return.jurisdiction_code)
    and (tr.organization_id=p_organization_id or tr.organization_id is null) and tr.is_active is true
    and (tr.effective_from is null or tr.effective_from<=vi.invoice_date) and (tr.effective_to is null or tr.effective_to>=vi.invoice_date);

  v_output_tax:=round(coalesce(v_output_tax,0),2); v_input_tax:=round(coalesce(v_input_tax,0),2);
  v_payable:=greatest(round(v_output_tax-v_input_tax,2),0); v_refund:=greatest(round(v_input_tax-v_output_tax,2),0);

  update public.finance_vat_returns set output_tax=v_output_tax,input_tax=v_input_tax,tax_payable=v_payable,tax_refund=v_refund,
    currency_code=upper(v_currency),
    calculation=jsonb_build_object('method','POSTED_ACCOUNTING_EVIDENCE_V1','jurisdiction_code',upper(v_return.jurisdiction_code),
      'period_start',v_return.period_start,'period_end',v_return.period_end,'output_document_count',v_output_documents,
      'customer_credit_note_count',v_customer_credits,'input_document_count',v_input_documents,'output_tax',v_output_tax,
      'input_tax',v_input_tax,'tax_payable',v_payable,'tax_refund',v_refund,'currency_code',upper(v_currency),'calculated_at',now()),
    status='CALCULATED',calculated_at=now(),calculated_by=p_calculated_by,updated_at=now()
  where id=v_return.id returning * into v_return;
  return to_jsonb(v_return);
end;
$$;

create or replace function public.mark_finance_vat_return_submitted(p_organization_id uuid,p_entity_id uuid,p_vat_return_id uuid,p_submission_reference text,p_submitted_by uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_return public.finance_vat_returns%rowtype;
begin
  if p_submitted_by is null then raise exception 'authenticated submitted_by required'; end if;
  if nullif(btrim(p_submission_reference),'') is null then raise exception 'submission_reference required'; end if;
  select * into v_return from public.finance_vat_returns where id=p_vat_return_id and organization_id=p_organization_id and entity_id=p_entity_id for update;
  if not found then raise exception 'VAT return not found in organization and entity scope'; end if;
  if upper(coalesce(v_return.status,''))<>'CALCULATED' then raise exception 'VAT return must be calculated before it can be marked submitted'; end if;
  update public.finance_vat_returns set status='SUBMITTED',submission_reference=btrim(p_submission_reference),submitted_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('submitted_by',p_submitted_by),updated_at=now()
  where id=v_return.id returning * into v_return;
  return to_jsonb(v_return);
end;
$$;

alter table public.finance_vat_returns enable row level security;
revoke all on function public.finance_validate_vat_return() from public,anon,authenticated;
revoke all on function public.calculate_finance_vat_return(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.mark_finance_vat_return_submitted(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.finance_validate_vat_return() to service_role;
grant execute on function public.calculate_finance_vat_return(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.mark_finance_vat_return_submitted(uuid,uuid,uuid,text,uuid) to service_role;

commit;
