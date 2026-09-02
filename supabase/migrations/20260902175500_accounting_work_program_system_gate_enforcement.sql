begin;

create or replace function public.enforce_accounting_work_item_system_gate()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('READY_FOR_REVIEW','COMPLETE')
     and coalesce(new.capability_id, '') in ('bank_reconciliation','journals','statutory_filings','close')
     and coalesce((new.metadata->'system_gate'->>'satisfied')::boolean, false) is not true then
    raise exception 'SYSTEM_GATE_REQUIRED:%', new.capability_id using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists accounting_work_item_system_gate_guard on public.accounting_engagement_work_items;
create trigger accounting_work_item_system_gate_guard
before insert or update of status, capability_id, metadata
on public.accounting_engagement_work_items
for each row
execute function public.enforce_accounting_work_item_system_gate();

commit;
