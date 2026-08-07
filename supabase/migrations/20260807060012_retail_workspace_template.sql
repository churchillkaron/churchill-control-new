do $$
declare
  v_template_id uuid;
  v_template_count integer;
  v_module_id text;
  v_sort_order integer;
begin
  select count(*)::integer
  into v_template_count
  from public.workspace_templates
  where lower(btrim(industry)) = 'retail';

  if v_template_count > 1 then
    raise exception 'Multiple Retail workspace templates already exist';
  end if;

  select id
  into v_template_id
  from public.workspace_templates
  where lower(btrim(industry)) = 'retail'
  order by created_at nulls last, id
  limit 1;

  if v_template_id is null then
    insert into public.workspace_templates (
      name,
      industry,
      description
    ) values (
      'Retail Template',
      'retail',
      'Retail operations, stationary POS, inventory, procurement, customer engagement, finance, workforce, analytics, and AI.'
    )
    returning id into v_template_id;
  else
    update public.workspace_templates
    set name = 'Retail Template',
        industry = 'retail',
        description = 'Retail operations, stationary POS, inventory, procurement, customer engagement, finance, workforce, analytics, and AI.'
    where id = v_template_id;
  end if;

  for v_module_id, v_sort_order in
    select module_id, sort_order
    from (values
      ('operations', 1),
      ('pos', 2),
      ('inventory', 3),
      ('procurement', 4),
      ('crm', 5),
      ('customer_portal', 6),
      ('finance', 7),
      ('accounting', 8),
      ('payroll', 9),
      ('hr', 10),
      ('analytics', 11),
      ('marketing_ai', 12),
      ('owner_ai', 13)
    ) as expected(module_id, sort_order)
  loop
    if not exists (
      select 1
      from public.platform_modules module
      where module.id = v_module_id
        and lower(coalesce(module.status, '')) = 'active'
    ) then
      raise exception 'Required Retail platform module is unavailable: %', v_module_id;
    end if;

    update public.workspace_template_modules
    set required = true,
        sort_order = v_sort_order
    where template_id = v_template_id
      and module_id = v_module_id;

    if not found then
      insert into public.workspace_template_modules (
        template_id,
        module_id,
        required,
        sort_order
      ) values (
        v_template_id,
        v_module_id,
        true,
        v_sort_order
      );
    end if;
  end loop;
end;
$$;
