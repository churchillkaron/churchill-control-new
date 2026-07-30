begin;

create unique index if not exists restaurant_payment_allocations_unique_item_settlement_idx
  on public.restaurant_payment_allocations (organization_id, order_item_id)
  where allocation_type = 'ITEM'
    and order_item_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurant_payment_allocations_type_check'
      and conrelid = 'public.restaurant_payment_allocations'::regclass
  ) then
    alter table public.restaurant_payment_allocations
      add constraint restaurant_payment_allocations_type_check
      check (allocation_type in ('ORDER', 'ITEM'));
  end if;
end;
$$;

commit;
