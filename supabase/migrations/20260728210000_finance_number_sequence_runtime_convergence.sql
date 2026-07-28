begin;

create or replace function public.finance_next_document_number(
  p_organization_id uuid,
  p_entity_id uuid,
  p_document_type text,
  p_prefix text,
  p_document_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_type text;
  v_configured_type text;
  v_config_id uuid;
  v_prefix text;
  v_suffix text;
  v_padding integer;
  v_reset_policy text;
  v_config_next bigint;
  v_year integer;
  v_month integer;
  v_bucket_year integer;
  v_bucket_month integer;
  v_sequence_id uuid;
  v_last_number bigint;
  v_next_number bigint;
  v_period_token text;
  v_separator text;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;

  if nullif(btrim(p_document_type), '') is null then
    raise exception 'document_type required';
  end if;

  if p_document_date is null then
    raise exception 'document date required';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Entity is outside organization scope';
  end if;

  v_document_type := upper(btrim(p_document_type));
  v_configured_type := case v_document_type
    when 'INVOICE' then 'CUSTOMER_INVOICE'
    when 'CUSTOMER_INVOICE_CREATED' then 'CUSTOMER_INVOICE'
    else v_document_type
  end;

  select
    id,
    upper(btrim(document_type)),
    nullif(btrim(prefix), ''),
    coalesce(suffix, ''),
    greatest(1, least(20, padding)),
    upper(btrim(reset_policy)),
    greatest(1, next_number)
  into
    v_config_id,
    v_configured_type,
    v_prefix,
    v_suffix,
    v_padding,
    v_reset_policy,
    v_config_next
  from public.finance_number_sequences
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and upper(btrim(document_type)) = v_configured_type
    and upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if v_config_id is null then
    v_prefix := nullif(btrim(p_prefix), '');
    if v_prefix is null then
      raise exception 'No active Number Sequence is configured for %', v_configured_type;
    end if;

    v_suffix := '';
    v_padding := 4;
    v_reset_policy := 'MONTHLY';
    v_config_next := 1;
  end if;

  if v_reset_policy not in ('NEVER', 'YEARLY', 'MONTHLY') then
    raise exception 'Unsupported reset policy %', v_reset_policy;
  end if;

  v_year := extract(year from p_document_date)::integer;
  v_month := extract(month from p_document_date)::integer;

  if v_reset_policy = 'NEVER' then
    v_bucket_year := 0;
    v_bucket_month := 0;
    v_period_token := '';
  elsif v_reset_policy = 'YEARLY' then
    v_bucket_year := v_year;
    v_bucket_month := 0;
    v_period_token := right(v_year::text, 2);
  else
    v_bucket_year := v_year;
    v_bucket_month := v_month;
    v_period_token := right(v_year::text, 2) || lpad(v_month::text, 2, '0');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        '|',
        p_organization_id::text,
        p_entity_id::text,
        v_configured_type,
        v_bucket_year::text,
        v_bucket_month::text
      ),
      0
    )
  );

  select id, coalesce(last_number, 0)
  into v_sequence_id, v_last_number
  from public.document_number_sequences
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and upper(btrim(document_type)) = v_configured_type
    and year = v_bucket_year
    and month = v_bucket_month
  limit 1
  for update;

  if found then
    v_next_number := greatest(v_last_number + 1, v_config_next);

    update public.document_number_sequences
    set last_number = v_next_number,
        prefix = v_prefix,
        updated_at = now()
    where id = v_sequence_id;
  else
    v_next_number := v_config_next;

    insert into public.document_number_sequences (
      organization_id,
      entity_id,
      document_type,
      prefix,
      year,
      month,
      last_number,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      p_entity_id,
      v_configured_type,
      v_prefix,
      v_bucket_year,
      v_bucket_month,
      v_next_number,
      now(),
      now()
    );
  end if;

  if v_config_id is not null then
    update public.finance_number_sequences
    set next_number = v_next_number + 1,
        updated_at = now()
    where id = v_config_id
      and organization_id = p_organization_id;
  end if;

  v_separator := case
    when v_prefix is null or v_prefix = '' then ''
    when right(v_prefix, 1) in ('-', '/', '_') then ''
    else '-'
  end;

  return
    coalesce(v_prefix, '') ||
    v_separator ||
    v_period_token ||
    lpad(v_next_number::text, v_padding, '0') ||
    coalesce(v_suffix, '');
end;
$$;

revoke all on function public.finance_next_document_number(uuid, uuid, text, text, date) from public;
grant execute on function public.finance_next_document_number(uuid, uuid, text, text, date) to service_role;

notify pgrst, 'reload schema';

commit;
