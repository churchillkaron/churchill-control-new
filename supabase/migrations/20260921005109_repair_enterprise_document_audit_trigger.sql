create or replace function public.enterprise_document_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_org uuid;
  v_reference uuid;
  v_actor uuid;
  v_action text;
  v_payload jsonb;
begin
  if tg_op = 'INSERT' then
    v_org := new.organization_id;
    v_reference := new.id;
    v_actor := new.created_by;
    v_action := 'insert';
    v_payload := jsonb_build_object(
      'document_name', new.document_name,
      'document_type', new.document_type,
      'document_status', new.document_status,
      'created_by', new.created_by
    );
  elsif tg_op = 'UPDATE' then
    v_org := new.organization_id;
    v_reference := new.id;
    v_actor := coalesce(new.created_by, old.created_by);
    v_action := 'update';
    v_payload := jsonb_build_object(
      'old_status', old.document_status,
      'new_status', new.document_status,
      'version_number', new.version_number,
      'updated_at', new.updated_at
    );
  elsif tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_reference := old.id;
    v_actor := old.created_by;
    v_action := 'delete';
    v_payload := jsonb_build_object(
      'document_name', old.document_name,
      'document_type', old.document_type,
      'deleted_at', now()
    );
  else
    return null;
  end if;

  insert into public.enterprise_audit_events (
    organization_id,
    event_table,
    event_action,
    reference_id,
    triggered_by,
    severity,
    event_payload
  ) values (
    v_org,
    'enterprise_documents',
    v_action,
    v_reference,
    v_actor,
    'medium',
    coalesce(v_payload, '{}'::jsonb)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

revoke all on function public.enterprise_document_audit_trigger() from public, anon, authenticated;
grant execute on function public.enterprise_document_audit_trigger() to service_role;
