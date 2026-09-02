begin;

create or replace function public.create_enterprise_document_atomic(
  p_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_document_type text,
  p_document_name text,
  p_document_number text,
  p_classification text,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_mime_type text,
  p_checksum_sha256 text,
  p_source_filename text,
  p_created_by uuid,
  p_owner_staff_id uuid,
  p_effective_date date,
  p_expiry_date date,
  p_review_due_at date,
  p_retention_until date,
  p_reference_table text,
  p_reference_id uuid,
  p_source_organization_document_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns public.enterprise_documents
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document public.enterprise_documents%rowtype;
  v_entity_org uuid;
  v_actor_org uuid;
begin
  if p_id is null or p_organization_id is null then
    raise exception using errcode = '23514', message = 'Document id and organization are required';
  end if;
  if nullif(btrim(coalesce(p_document_name, '')), '') is null then
    raise exception using errcode = '23514', message = 'Document name is required';
  end if;
  if nullif(btrim(coalesce(p_document_type, '')), '') is null then
    raise exception using errcode = '23514', message = 'Document type is required';
  end if;
  if nullif(btrim(coalesce(p_storage_path, '')), '') is null then
    raise exception using errcode = '23514', message = 'Document storage path is required';
  end if;

  if p_entity_id is not null then
    select organization_id into v_entity_org
    from public.legal_entities
    where id = p_entity_id;
    if not found or v_entity_org is distinct from p_organization_id then
      raise exception using errcode = '23514', message = 'Document legal entity must belong to organization';
    end if;
  end if;

  if p_created_by is not null then
    select active_organization_id into v_actor_org
    from public.staff_accounts
    where id = p_created_by;
    if not found or v_actor_org is distinct from p_organization_id then
      raise exception using errcode = '42501', message = 'Document creator must belong to organization';
    end if;
  end if;

  if p_owner_staff_id is not null then
    select active_organization_id into v_actor_org
    from public.staff_accounts
    where id = p_owner_staff_id;
    if not found or v_actor_org is distinct from p_organization_id then
      raise exception using errcode = '23514', message = 'Document owner must belong to organization';
    end if;
  end if;

  insert into public.enterprise_documents (
    id,
    organization_id,
    entity_id,
    document_type,
    document_name,
    document_number,
    classification,
    document_status,
    reference_table,
    reference_id,
    storage_path,
    file_size_bytes,
    mime_type,
    version_number,
    metadata,
    created_by,
    owner_staff_id,
    effective_date,
    expiry_date,
    review_due_at,
    retention_until,
    legal_hold,
    checksum_sha256,
    source_organization_document_id
  ) values (
    p_id,
    p_organization_id,
    p_entity_id,
    upper(btrim(p_document_type)),
    btrim(p_document_name),
    nullif(btrim(coalesce(p_document_number, '')), ''),
    upper(btrim(coalesce(p_classification, 'INTERNAL'))),
    'draft',
    nullif(btrim(coalesce(p_reference_table, '')), ''),
    p_reference_id,
    btrim(p_storage_path),
    greatest(coalesce(p_file_size_bytes, 0), 0),
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    1,
    coalesce(p_metadata, '{}'::jsonb),
    p_created_by,
    p_owner_staff_id,
    p_effective_date,
    p_expiry_date,
    p_review_due_at,
    p_retention_until,
    false,
    nullif(lower(btrim(coalesce(p_checksum_sha256, ''))), ''),
    p_source_organization_document_id
  ) returning * into v_document;

  insert into public.enterprise_document_versions (
    organization_id,
    enterprise_document_id,
    version_number,
    storage_path,
    file_size_bytes,
    mime_type,
    change_summary,
    uploaded_by,
    source_filename,
    checksum_sha256,
    metadata
  ) values (
    p_organization_id,
    p_id,
    1,
    btrim(p_storage_path),
    greatest(coalesce(p_file_size_bytes, 0), 0),
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    'Initial controlled version',
    p_created_by,
    nullif(btrim(coalesce(p_source_filename, '')), ''),
    nullif(lower(btrim(coalesce(p_checksum_sha256, ''))), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );

  if p_reference_table is not null and p_reference_id is not null then
    insert into public.enterprise_document_links (
      organization_id,
      entity_id,
      enterprise_document_id,
      reference_type,
      reference_id,
      relation_type,
      created_by
    ) values (
      p_organization_id,
      p_entity_id,
      p_id,
      btrim(p_reference_table),
      p_reference_id,
      'RELATED',
      p_created_by
    ) on conflict do nothing;
  end if;

  return v_document;
end;
$$;

create or replace function public.append_enterprise_document_version_atomic(
  p_organization_id uuid,
  p_document_id uuid,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_mime_type text,
  p_checksum_sha256 text,
  p_source_filename text,
  p_change_summary text,
  p_uploaded_by uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns public.enterprise_document_versions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document public.enterprise_documents%rowtype;
  v_version integer;
  v_actor_org uuid;
  v_row public.enterprise_document_versions%rowtype;
begin
  if p_organization_id is null or p_document_id is null then
    raise exception using errcode = '23514', message = 'Organization and document are required';
  end if;
  if nullif(btrim(coalesce(p_storage_path, '')), '') is null then
    raise exception using errcode = '23514', message = 'Version storage path is required';
  end if;

  select * into v_document
  from public.enterprise_documents
  where organization_id = p_organization_id
    and id = p_document_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Controlled document not found';
  end if;

  if p_uploaded_by is not null then
    select active_organization_id into v_actor_org
    from public.staff_accounts
    where id = p_uploaded_by;
    if not found or v_actor_org is distinct from p_organization_id then
      raise exception using errcode = '42501', message = 'Document version actor must belong to organization';
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.enterprise_document_versions
  where enterprise_document_id = p_document_id;

  insert into public.enterprise_document_versions (
    organization_id,
    enterprise_document_id,
    version_number,
    storage_path,
    file_size_bytes,
    mime_type,
    change_summary,
    uploaded_by,
    source_filename,
    checksum_sha256,
    metadata
  ) values (
    p_organization_id,
    p_document_id,
    v_version,
    btrim(p_storage_path),
    greatest(coalesce(p_file_size_bytes, 0), 0),
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    nullif(btrim(coalesce(p_change_summary, '')), ''),
    p_uploaded_by,
    nullif(btrim(coalesce(p_source_filename, '')), ''),
    nullif(lower(btrim(coalesce(p_checksum_sha256, ''))), ''),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_row;

  update public.enterprise_documents
  set storage_path = btrim(p_storage_path),
      file_size_bytes = greatest(coalesce(p_file_size_bytes, 0), 0),
      mime_type = nullif(btrim(coalesce(p_mime_type, '')), ''),
      version_number = v_version,
      checksum_sha256 = nullif(lower(btrim(coalesce(p_checksum_sha256, ''))), ''),
      document_status = 'draft',
      approved_by = null,
      approved_at = null,
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_document_id;

  return v_row;
end;
$$;

comment on function public.create_enterprise_document_atomic is
  'Creates the canonical controlled-document row, immutable version 1 and initial business-object link in one transaction.';
comment on function public.append_enterprise_document_version_atomic is
  'Serializes controlled document revision numbers and invalidates prior approval when a new version is appended.';

commit;
