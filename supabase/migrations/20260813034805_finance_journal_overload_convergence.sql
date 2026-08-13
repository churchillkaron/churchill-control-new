create or replace function public.finance_post_journal_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_posting_date date,
  p_document_date date,
  p_journal_type text,
  p_reference text,
  p_source_module text,
  p_source_document text,
  p_source_document_id uuid,
  p_description text,
  p_currency_code text,
  p_exchange_rate numeric,
  p_lines jsonb,
  p_created_by uuid,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.finance_post_journal_atomic(
    p_organization_id,
    p_entity_id,
    p_posting_date,
    p_document_date,
    p_journal_type,
    p_reference,
    p_source_module,
    p_source_document,
    p_source_document_id,
    p_description,
    p_currency_code,
    p_exchange_rate,
    p_lines,
    p_created_by::text,
    p_idempotency_key
  );
$function$;

revoke all on function public.finance_post_journal_atomic(uuid, uuid, date, date, text, text, text, text, uuid, text, text, numeric, jsonb, uuid, text) from public;
grant execute on function public.finance_post_journal_atomic(uuid, uuid, date, date, text, text, text, text, uuid, text, text, numeric, jsonb, uuid, text) to service_role;

notify pgrst, 'reload schema';
