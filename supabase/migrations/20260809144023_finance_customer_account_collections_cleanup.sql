do $migration$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.finance_run_workspace_crud_certification_probe(uuid,uuid,uuid,date,text)'::regprocedure
  ) into v_def;

  if v_def is null then
    raise exception 'finance_run_workspace_crud_certification_probe not found';
  end if;

  v_new := replace(
    v_def,
    $old$  select customer.id
  into v_customer_id
  from public.customer_loyalty_accounts customer
  where customer.organization_id = p_organization_id
    and customer.entity_id = p_entity_id
  order by customer.created_at nulls last, customer.id
  limit 1;

  if v_customer_id is null then
    raise exception 'A scoped customer is required for CRUD certification';
  end if;$old$,
    $new$  select relationship.party_id
  into v_customer_id
  from public.party_relationships relationship
  where relationship.organization_id = p_organization_id
    and lower(relationship.relationship_type) = 'customer'
    and lower(coalesce(relationship.status, 'active')) <> 'archived'
  order by relationship.created_at nulls last, relationship.party_id
  limit 1;

  if v_customer_id is null then
    raise exception 'A scoped customer party is required for CRUD certification';
  end if;$new$
  );

  v_new := replace(
    v_new,
    $old$    jsonb_build_object(
      'workspace', 'collections', 'table', 'finance_collection_cases', 'scope', 'entity',
      'update_column', 'notes', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'customer_id', v_customer_id, 'case_reference', v_tag || ':COL',
        'opened_date', p_posting_date, 'priority', 'NORMAL', 'notes', v_tag,
        'status', 'OPEN', 'created_by', p_actor_id
      )
    ),$old$,
    $new$    jsonb_build_object(
      'workspace', 'collections', 'table', 'customer_collection_cases', 'scope', 'entity',
      'update_column', 'hold_reason', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'customer_id', v_customer_id, 'party_id', v_customer_id, 'case_number', v_tag || ':COL',
        'priority', 'NORMAL', 'hold_reason', v_tag,
        'status', 'OPEN', 'opened_by', p_actor_id
      )
    ),$new$
  );

  v_new := replace(
    v_new,
    $old$    select count(*) into v_read_count
    from public.accounts_receivable
    where organization_id = p_organization_id
      and entity_id = p_entity_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'read.customer_statements', 'passed', true,
      'details', jsonb_build_object('table', 'accounts_receivable', 'row_count', v_read_count)
    ));$old$,
    $new$    select count(*) into v_read_count
    from public.customer_statement_runs
    where organization_id = p_organization_id
      and entity_id = p_entity_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'read.customer_statements', 'passed', true,
      'details', jsonb_build_object('table', 'customer_statement_runs', 'row_count', v_read_count)
    ));$new$
  );

  v_new := replace(
    v_new,
    $old$SET search_path TO 'public', 'pg_temp'$old$,
    $new$SET search_path TO ''$new$
  );

  if v_new = v_def then
    raise exception 'Finance certification probe convergence made no changes';
  end if;

  if position('finance_collection_cases' in v_new) > 0 then
    raise exception 'Legacy finance_collection_cases reference remains in certification probe';
  end if;

  if position('accounts_receivable' in v_new) = 0 then
    null;
  end if;

  execute v_new;
end;
$migration$;

drop table public.finance_collection_cases;
