-- Persist the master-data selections made in the Finance customer-invoice form.
-- The invoice RPC remains service-role only and validates every referenced record
-- against the active organization/entity before writing the line.

alter table public.customer_invoice_lines
  add column if not exists item_id uuid,
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists revenue_account_id uuid,
  add column if not exists cost_center_id uuid,
  add column if not exists department_id uuid,
  add column if not exists project_id uuid;

create index if not exists customer_invoice_lines_item_idx
  on public.customer_invoice_lines (organization_id, entity_id, item_id)
  where item_id is not null;

create index if not exists customer_invoice_lines_cost_center_idx
  on public.customer_invoice_lines (organization_id, entity_id, cost_center_id)
  where cost_center_id is not null;

create index if not exists customer_invoice_lines_department_idx
  on public.customer_invoice_lines (organization_id, entity_id, department_id)
  where department_id is not null;

create index if not exists customer_invoice_lines_project_idx
  on public.customer_invoice_lines (organization_id, entity_id, project_id)
  where project_id is not null;

create index if not exists customer_invoice_lines_revenue_account_idx
  on public.customer_invoice_lines (organization_id, entity_id, revenue_account_id)
  where revenue_account_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_invoice_lines_item_id_fkey'
  ) then
    alter table public.customer_invoice_lines
      add constraint customer_invoice_lines_item_id_fkey
      foreign key (item_id) references public.inventory_items(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_invoice_lines_revenue_account_id_fkey'
  ) then
    alter table public.customer_invoice_lines
      add constraint customer_invoice_lines_revenue_account_id_fkey
      foreign key (revenue_account_id) references public.chart_of_accounts(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_invoice_lines_cost_center_id_fkey'
  ) then
    alter table public.customer_invoice_lines
      add constraint customer_invoice_lines_cost_center_id_fkey
      foreign key (cost_center_id) references public.cost_centers(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_invoice_lines_department_id_fkey'
  ) then
    alter table public.customer_invoice_lines
      add constraint customer_invoice_lines_department_id_fkey
      foreign key (department_id) references public.departments(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_invoice_lines_project_id_fkey'
  ) then
    alter table public.customer_invoice_lines
      add constraint customer_invoice_lines_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete restrict;
  end if;
end
$$;

create or replace function public.finance_create_customer_invoice_atomic(
  p_invoice_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_customer_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_currency_code text,
  p_exchange_rate numeric,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_notes text,
  p_lines jsonb,
  p_journal_lines jsonb,
  p_created_by uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invoice public.customer_invoices%rowtype;
  v_receivable public.accounts_receivable%rowtype;
  v_line jsonb;
  v_journal jsonb;
  v_item_id uuid;
  v_revenue_account_id uuid;
  v_cost_center_id uuid;
  v_department_id uuid;
  v_project_id uuid;
  v_tax_rule_id uuid;
  v_tax_code text;
  v_tax_rate numeric;
  v_discount_amount numeric;
  v_line_tax_amount numeric;
  v_line_net_amount numeric;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;

  if p_customer_id is null then
    raise exception 'customer_id required';
  end if;

  if p_invoice_id is null then
    raise exception 'invoice_id required';
  end if;

  if coalesce(jsonb_array_length(p_lines), 0) = 0 then
    raise exception 'invoice lines required';
  end if;

  if coalesce(jsonb_array_length(p_journal_lines), 0) = 0 then
    raise exception 'journal lines required';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Entity is outside organization scope';
  end if;

  insert into public.customer_invoices (
    id,
    organization_id,
    entity_id,
    customer_id,
    invoice_number,
    invoice_date,
    due_date,
    currency_code,
    exchange_rate,
    subtotal,
    tax_amount,
    total_amount,
    outstanding_amount,
    status,
    created_by
  ) values (
    p_invoice_id,
    p_organization_id,
    p_entity_id,
    p_customer_id,
    p_invoice_number,
    p_invoice_date,
    p_due_date,
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    p_subtotal,
    p_tax_amount,
    p_total_amount,
    p_total_amount,
    'OPEN',
    p_created_by
  )
  returning * into v_invoice;

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
  loop
    v_item_id := nullif(v_line->>'item_id', '')::uuid;
    v_revenue_account_id := nullif(v_line->>'revenue_account_id', '')::uuid;
    v_cost_center_id := nullif(v_line->>'cost_center_id', '')::uuid;
    v_department_id := nullif(v_line->>'department_id', '')::uuid;
    v_project_id := nullif(v_line->>'project_id', '')::uuid;
    v_tax_rule_id := coalesce(
      nullif(v_line->>'tax_rule_id', '')::uuid,
      nullif(v_line->>'tax_code_id', '')::uuid
    );
    v_discount_amount := coalesce(nullif(v_line->>'discount_amount', '')::numeric, 0);
    v_line_tax_amount := coalesce(nullif(v_line->>'tax_amount', '')::numeric, 0);
    v_line_net_amount := coalesce(nullif(v_line->>'line_total', '')::numeric, 0);
    v_tax_code := null;
    v_tax_rate := null;

    if v_discount_amount < 0 then
      raise exception 'Invoice line discount cannot be negative';
    end if;

    if v_line_tax_amount < 0 then
      raise exception 'Invoice line tax cannot be negative';
    end if;

    if v_item_id is not null then
      perform 1
      from public.inventory_items i
      where i.id = v_item_id
        and i.organization_id = p_organization_id
        and (i.entity_id is null or i.entity_id = p_entity_id)
        and coalesce(i.is_active, true) = true;
      if not found then
        raise exception 'Invoice item/service is outside organization/entity scope or inactive';
      end if;
    end if;

    if v_revenue_account_id is not null then
      perform 1
      from public.chart_of_accounts a
      where a.id = v_revenue_account_id
        and a.organization_id = p_organization_id
        and (a.entity_id is null or a.entity_id = p_entity_id)
        and coalesce(a.is_active, true) = true;
      if not found then
        raise exception 'Invoice revenue account is outside organization/entity scope or inactive';
      end if;
    end if;

    if v_cost_center_id is not null then
      perform 1
      from public.cost_centers c
      where c.id = v_cost_center_id
        and c.organization_id = p_organization_id
        and (c.entity_id is null or c.entity_id = p_entity_id)
        and coalesce(c.is_active, true) = true;
      if not found then
        raise exception 'Invoice cost centre is outside organization/entity scope or inactive';
      end if;
    end if;

    if v_department_id is not null then
      perform 1
      from public.departments d
      where d.id = v_department_id
        and d.organization_id = p_organization_id
        and (d.entity_id is null or d.entity_id = p_entity_id)
        and coalesce(d.is_active, true) = true;
      if not found then
        raise exception 'Invoice department is outside organization/entity scope or inactive';
      end if;
    end if;

    if v_project_id is not null then
      perform 1
      from public.projects p
      where p.id = v_project_id
        and p.organization_id = p_organization_id
        and (p.entity_id is null or p.entity_id = p_entity_id)
        and coalesce(upper(p.status), 'ACTIVE') not in ('ARCHIVED', 'CANCELLED', 'CANCELED', 'INACTIVE');
      if not found then
        raise exception 'Invoice project is outside organization/entity scope or inactive';
      end if;
    end if;

    if v_tax_rule_id is not null then
      select t.tax_code, t.tax_rate
      into v_tax_code, v_tax_rate
      from public.tax_rules t
      where t.id = v_tax_rule_id
        and (t.organization_id is null or t.organization_id = p_organization_id)
        and coalesce(t.is_active, true) = true;
      if not found then
        raise exception 'Invoice tax code is outside organization scope or inactive';
      end if;
    elsif v_line_tax_amount <> 0 then
      raise exception 'Tax code is required when invoice line tax amount is non-zero';
    end if;

    insert into public.customer_invoice_lines (
      organization_id,
      entity_id,
      customer_invoice_id,
      item_id,
      description,
      quantity,
      unit_price,
      discount_amount,
      line_total,
      revenue_account_id,
      cost_center_id,
      department_id,
      project_id,
      tax_rule_id,
      tax_code,
      tax_rate,
      tax_amount,
      net_amount,
      gross_amount
    ) values (
      p_organization_id,
      p_entity_id,
      p_invoice_id,
      v_item_id,
      nullif(btrim(v_line->>'description'), ''),
      coalesce(nullif(v_line->>'quantity', '')::numeric, 0),
      coalesce(nullif(v_line->>'unit_price', '')::numeric, 0),
      v_discount_amount,
      v_line_net_amount,
      v_revenue_account_id,
      v_cost_center_id,
      v_department_id,
      v_project_id,
      v_tax_rule_id,
      v_tax_code,
      v_tax_rate,
      v_line_tax_amount,
      v_line_net_amount,
      v_line_net_amount + v_line_tax_amount
    );
  end loop;

  insert into public.accounts_receivable (
    organization_id,
    entity_id,
    customer_id,
    customer_invoice_id,
    amount,
    outstanding_balance,
    due_date,
    status
  ) values (
    p_organization_id,
    p_entity_id,
    p_customer_id,
    p_invoice_id,
    p_total_amount,
    p_total_amount,
    p_due_date,
    'OPEN'
  )
  returning * into v_receivable;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_invoice_date,
    p_document_date => p_invoice_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_receivable:' || p_invoice_id::text,
    p_source_module => 'accounts_receivable',
    p_source_document => 'CUSTOMER_INVOICE_CREATED',
    p_source_document_id => p_invoice_id,
    p_description => 'Customer Invoice ' || p_invoice_number,
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_created_by,
    p_idempotency_key => 'accounting-event:CUSTOMER_INVOICE_CREATED:accounts_receivable:' || p_invoice_id::text
  ) into v_journal;

  update public.customer_invoices
  set journal_entry_id = nullif(v_journal->'journal'->>'id', '')::uuid,
      updated_at = now()
  where id = p_invoice_id;

  return jsonb_build_object(
    'success', true,
    'invoice', to_jsonb(v_invoice),
    'receivable', to_jsonb(v_receivable),
    'journal', v_journal,
    'notes', p_notes
  );
end;
$function$;

revoke all on function public.finance_create_customer_invoice_atomic(uuid,uuid,uuid,uuid,text,date,date,text,numeric,numeric,numeric,numeric,text,jsonb,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.finance_create_customer_invoice_atomic(uuid,uuid,uuid,uuid,text,date,date,text,numeric,numeric,numeric,numeric,text,jsonb,jsonb,uuid)
  to service_role;
