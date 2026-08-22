begin;

create or replace function public.finance_statutory_filing_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.filing_type := upper(btrim(coalesce(new.filing_type,'')));
  new.jurisdiction_code := upper(btrim(coalesce(new.jurisdiction_code, new.jurisdiction, '')));
  new.jurisdiction := new.jurisdiction_code;
  new.status := upper(btrim(coalesce(new.status,'DRAFT')));

  if new.organization_id is null or new.entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;
  if new.filing_type = '' then raise exception 'filing_type required'; end if;
  if new.jurisdiction_code = '' then raise exception 'jurisdiction_code required'; end if;
  if new.period_start is null or new.period_end is null or new.period_end < new.period_start then
    raise exception 'valid filing period required';
  end if;
  if new.due_date is null then raise exception 'due_date required'; end if;
  if new.status not in ('DRAFT','READY','SUBMITTED') then raise exception 'Unsupported statutory filing status'; end if;

  perform 1 from public.legal_entities
  where id = new.entity_id and organization_id = new.organization_id;
  if not found then raise exception 'Legal Entity is outside organization scope'; end if;

  if tg_op = 'INSERT' then
    new.status := 'DRAFT';
    new.submission_reference := null;
    new.submitted_at := null;
  elsif upper(coalesce(old.status,'')) = 'SUBMITTED' then
    if new.filing_type is distinct from old.filing_type
       or new.jurisdiction_code is distinct from old.jurisdiction_code
       or new.period_start is distinct from old.period_start
       or new.period_end is distinct from old.period_end
       or new.due_date is distinct from old.due_date
       or new.submission_reference is distinct from old.submission_reference
       or new.submitted_at is distinct from old.submitted_at
       or new.status is distinct from old.status then
      raise exception 'Submitted statutory filing evidence is immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_finance_statutory_filing_guard on public.finance_statutory_filings;
create trigger trg_finance_statutory_filing_guard
before insert or update on public.finance_statutory_filings
for each row execute function public.finance_statutory_filing_guard();

create or replace function public.mark_finance_statutory_filing_submitted(
  p_organization_id uuid,
  p_entity_id uuid,
  p_filing_id uuid,
  p_submission_reference text,
  p_submitted_by uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_filing public.finance_statutory_filings%rowtype;
begin
  if p_organization_id is null or p_entity_id is null or p_filing_id is null then
    raise exception 'organization_id, entity_id and filing_id required';
  end if;
  if p_submitted_by is null then raise exception 'authenticated submitted_by required'; end if;
  if nullif(btrim(p_submission_reference),'') is null then raise exception 'submission_reference required'; end if;

  select * into v_filing
  from public.finance_statutory_filings
  where id = p_filing_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;
  if not found then raise exception 'Statutory filing not found in organization and entity scope'; end if;

  if upper(coalesce(v_filing.status,'DRAFT')) = 'SUBMITTED' then
    if v_filing.submission_reference = btrim(p_submission_reference) then
      return to_jsonb(v_filing);
    end if;
    raise exception 'Statutory filing is already submitted';
  end if;

  update public.finance_statutory_filings
  set status = 'SUBMITTED',
      submission_reference = btrim(p_submission_reference),
      submitted_at = now(),
      result = coalesce(result,'{}'::jsonb) || jsonb_build_object(
        'submission_mode','EXTERNAL_REFERENCE_RECORDED',
        'submitted_by',p_submitted_by,
        'recorded_at',now()
      ),
      updated_at = now()
  where id = v_filing.id
  returning * into v_filing;

  return to_jsonb(v_filing);
end;
$$;

revoke all on function public.finance_statutory_filing_guard() from public, anon, authenticated;
grant execute on function public.finance_statutory_filing_guard() to service_role;
revoke all on function public.mark_finance_statutory_filing_submitted(uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.mark_finance_statutory_filing_submitted(uuid,uuid,uuid,text,uuid) to service_role;

commit;
