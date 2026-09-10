create or replace function public.create_enterprise_document_pack_atomic(
  p_organization_id uuid,
  p_documents jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_document public.enterprise_documents%rowtype;
  v_documents jsonb := '[]'::jsonb;
  v_count integer;
begin
  if p_organization_id is null then raise exception 'DOCUMENT_PACK_ORGANIZATION_REQUIRED'; end if;
  if jsonb_typeof(p_documents) <> 'array' then raise exception 'DOCUMENT_PACK_ARRAY_REQUIRED'; end if;
  v_count := jsonb_array_length(p_documents);
  if v_count < 2 or v_count > 20 then raise exception 'DOCUMENT_PACK_COUNT_INVALID'; end if;

  for v_item in select value from jsonb_array_elements(p_documents) loop
    v_document := public.create_enterprise_document_atomic(
      p_id => (v_item->>'id')::uuid,
      p_organization_id => p_organization_id,
      p_entity_id => nullif(v_item->>'entity_id','')::uuid,
      p_document_type => v_item->>'document_type',
      p_document_name => v_item->>'document_name',
      p_document_number => nullif(v_item->>'document_number',''),
      p_classification => coalesce(nullif(v_item->>'classification',''),'INTERNAL'),
      p_storage_path => v_item->>'storage_path',
      p_file_size_bytes => coalesce((v_item->>'file_size_bytes')::bigint,0),
      p_mime_type => v_item->>'mime_type',
      p_checksum_sha256 => v_item->>'checksum_sha256',
      p_source_filename => v_item->>'source_filename',
      p_created_by => nullif(v_item->>'created_by','')::uuid,
      p_owner_staff_id => nullif(v_item->>'owner_staff_id','')::uuid,
      p_effective_date => nullif(v_item->>'effective_date','')::date,
      p_expiry_date => nullif(v_item->>'expiry_date','')::date,
      p_review_due_at => nullif(v_item->>'review_due_at','')::date,
      p_retention_until => nullif(v_item->>'retention_until','')::date,
      p_reference_table => nullif(v_item->>'reference_table',''),
      p_reference_id => nullif(v_item->>'reference_id','')::uuid,
      p_source_organization_document_id => nullif(v_item->>'source_organization_document_id','')::uuid,
      p_metadata => coalesce(v_item->'metadata','{}'::jsonb)
    );
    v_documents := v_documents || jsonb_build_array(to_jsonb(v_document));
  end loop;

  return jsonb_build_object('status','CREATED','count',v_count,'documents',v_documents);
end;
$$;

revoke all on function public.create_enterprise_document_pack_atomic(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_enterprise_document_pack_atomic(uuid, jsonb) to service_role;
