create or replace function public.finance_normalize_customer_credit_note_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.customer_invoices%rowtype;
  v_ratio numeric;
begin
  if upper(coalesce(new.document_type,'')) <> 'CREDIT_NOTE'
     or new.credit_note_for_invoice_id is null then
    return new;
  end if;

  select * into v_source
  from public.customer_invoices
  where id = new.credit_note_for_invoice_id
    and organization_id = new.organization_id
    and entity_id = new.entity_id;

  if not found then
    raise exception 'Source invoice not found for credit note amount normalization';
  end if;

  if coalesce(v_source.total_amount,0) <= 0 then
    raise exception 'Source invoice total must be greater than zero';
  end if;

  v_ratio := new.total_amount / v_source.total_amount;
  new.subtotal := round(coalesce(v_source.subtotal,0) * v_ratio, 2);
  new.tax_amount := round(new.total_amount - new.subtotal, 2);
  new.outstanding_balance := coalesce(new.outstanding_balance,0);
  new.outstanding_amount := coalesce(new.outstanding_amount,0);
  return new;
end;
$$;

create or replace function public.finance_normalize_customer_credit_note_line_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit public.customer_invoices%rowtype;
begin
  select * into v_credit
  from public.customer_invoices
  where id = new.customer_invoice_id
    and organization_id = new.organization_id
    and entity_id = new.entity_id;

  if not found or upper(coalesce(v_credit.document_type,'')) <> 'CREDIT_NOTE' then
    return new;
  end if;

  new.quantity := 1;
  new.unit_price := v_credit.subtotal;
  new.line_total := v_credit.subtotal;
  new.net_amount := v_credit.subtotal;
  new.tax_amount := v_credit.tax_amount;
  new.gross_amount := v_credit.total_amount;
  return new;
end;
$$;

drop trigger if exists trg_finance_normalize_customer_credit_note_amounts on public.customer_invoices;
create trigger trg_finance_normalize_customer_credit_note_amounts
before insert or update of total_amount, document_type, credit_note_for_invoice_id
on public.customer_invoices
for each row
execute function public.finance_normalize_customer_credit_note_amounts();

drop trigger if exists trg_finance_normalize_customer_credit_note_line_amounts on public.customer_invoice_lines;
create trigger trg_finance_normalize_customer_credit_note_line_amounts
before insert or update of customer_invoice_id, line_total, net_amount, gross_amount, tax_amount
on public.customer_invoice_lines
for each row
execute function public.finance_normalize_customer_credit_note_line_amounts();

revoke all on function public.finance_normalize_customer_credit_note_amounts() from public, anon, authenticated;
revoke all on function public.finance_normalize_customer_credit_note_line_amounts() from public, anon, authenticated;
grant execute on function public.finance_normalize_customer_credit_note_amounts() to service_role;
grant execute on function public.finance_normalize_customer_credit_note_line_amounts() to service_role;