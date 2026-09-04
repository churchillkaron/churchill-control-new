create or replace function public.calculate_finance_vat_return(
  p_organization_id uuid,
  p_entity_id uuid,
  p_vat_return_id uuid,
  p_calculated_by uuid
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_return public.finance_vat_returns%rowtype;
  v_currency text;
  v_output_tax numeric := 0;
  v_input_tax numeric := 0;
  v_output_documents integer := 0;
  v_input_documents integer := 0;
  v_customer_credits integer := 0;
  v_payable numeric := 0;
  v_refund numeric := 0;
begin
  if p_organization_id is null or p_entity_id is null or p_vat_return_id is null then
    raise exception 'organization_id, entity_id and vat_return_id required';
  end if;
  if p_calculated_by is null then
    raise exception 'authenticated calculated_by required';
  end if;

  select * into v_return
  from public.finance_vat_returns
  where id = p_vat_return_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then raise exception 'VAT return not found in organization and entity scope'; end if;
  if upper(coalesce(v_return.status,'DRAFT')) = 'SUBMITTED' then
    raise exception 'Submitted VAT returns cannot be recalculated';
  end if;

  select coalesce(
    nullif(profile.functional_currency,''),
    nullif(profile.base_currency,''),
    nullif(entity.currency,''),
    'THB'
  ) into v_currency
  from public.legal_entities entity
  left join public.finance_organization_profiles profile
    on profile.organization_id = p_organization_id
   and (profile.entity_id = p_entity_id or profile.entity_id is null)
  where entity.id = p_entity_id
    and entity.organization_id = p_organization_id
  order by (profile.entity_id = p_entity_id) desc nulls last
  limit 1;

  if v_currency is null then raise exception 'Functional currency could not be resolved'; end if;

  select
    coalesce(sum(
      case when upper(coalesce(ci.document_type,'INVOICE')) = 'CREDIT_NOTE' then -1 else 1 end
      * coalesce(cil.tax_amount,0)
      * coalesce(nullif(ci.exchange_rate,0),1)
    ),0),
    count(distinct ci.id)::integer,
    count(distinct ci.id) filter (where upper(coalesce(ci.document_type,'INVOICE')) = 'CREDIT_NOTE')::integer
  into v_output_tax, v_output_documents, v_customer_credits
  from public.customer_invoices ci
  join public.customer_invoice_lines cil
    on cil.customer_invoice_id = ci.id
   and cil.organization_id = ci.organization_id
   and cil.entity_id = ci.entity_id
  join public.tax_rules tr
    on tr.id = cil.tax_rule_id
  where ci.organization_id = p_organization_id
    and ci.entity_id = p_entity_id
    and ci.invoice_date between v_return.period_start and v_return.period_end
    and upper(tr.tax_type) = 'VAT'
    and upper(tr.tax_regime) = upper(v_return.jurisdiction_code)
    and (tr.organization_id = p_organization_id or tr.organization_id is null)
    and tr.is_active is true
    and (tr.effective_from is null or tr.effective_from <= ci.invoice_date)
    and (tr.effective_to is null or tr.effective_to >= ci.invoice_date)
    and exists (
      select 1 from public.journal_entries je
      where je.organization_id = p_organization_id
        and je.entity_id = p_entity_id
        and je.source_document_id = ci.id
        and upper(coalesce(je.status,'')) = 'POSTED'
        and coalesce(je.reversed,false) is not true
    );

  select
    coalesce(sum(vil.tax_amount * coalesce(nullif(vi.exchange_rate,0),1)),0),
    count(distinct vi.id)::integer
  into v_input_tax, v_input_documents
  from public.vendor_invoices vi
  join public.vendor_invoice_lines vil
    on vil.vendor_invoice_id = vi.id
   and vil.organization_id = vi.organization_id
   and vil.entity_id = vi.entity_id
  join public.tax_rules tr on tr.id = vil.tax_code_id
  where vi.organization_id = p_organization_id
    and vi.entity_id = p_entity_id
    and vi.invoice_date between v_return.period_start and v_return.period_end
    and upper(coalesce(vi.status,'')) = 'POSTED'
    and upper(coalesce(vi.approval_status,'')) = 'APPROVED'
    and vi.journal_entry_id is not null
    and upper(tr.tax_type) = 'VAT'
    and upper(tr.tax_regime) = upper(v_return.jurisdiction_code)
    and (tr.organization_id = p_organization_id or tr.organization_id is null)
    and tr.is_active is true
    and (tr.effective_from is null or tr.effective_from <= vi.invoice_date)
    and (tr.effective_to is null or tr.effective_to >= vi.invoice_date);

  v_output_tax := round(coalesce(v_output_tax,0),2);
  v_input_tax := round(coalesce(v_input_tax,0),2);
  v_payable := greatest(round(v_output_tax - v_input_tax,2),0);
  v_refund := greatest(round(v_input_tax - v_output_tax,2),0);

  update public.finance_vat_returns
  set output_tax = v_output_tax,
      input_tax = v_input_tax,
      tax_payable = v_payable,
      tax_refund = v_refund,
      currency_code = upper(v_currency),
      calculation = jsonb_build_object(
        'method','POSTED_GOVERNED_VAT_LINE_EVIDENCE_V2',
        'jurisdiction_code', upper(v_return.jurisdiction_code),
        'period_start', v_return.period_start,
        'period_end', v_return.period_end,
        'output_document_count', v_output_documents,
        'customer_credit_note_count', v_customer_credits,
        'input_document_count', v_input_documents,
        'output_tax', v_output_tax,
        'input_tax', v_input_tax,
        'tax_payable', v_payable,
        'tax_refund', v_refund,
        'currency_code', upper(v_currency),
        'calculated_at', now()
      ),
      status = 'CALCULATED',
      calculated_at = now(),
      calculated_by = p_calculated_by,
      updated_at = now()
  where id = v_return.id
  returning * into v_return;

  return to_jsonb(v_return);
end;
$function$;
