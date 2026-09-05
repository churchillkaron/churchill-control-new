begin;

create index if not exists hotel_bookings_group_pickup_idx
  on public.hotel_bookings(organization_id, property_id, group_id, check_in_date, check_out_date)
  where group_id is not null;

create index if not exists hotel_folio_lines_source_active_idx
  on public.hotel_folio_lines(organization_id, folio_id, source_type, source_id)
  where voided_at is null and source_type is not null and source_id is not null;

create index if not exists hotel_upsell_offers_scope_active_idx
  on public.hotel_upsell_offers(organization_id, property_id, active, name);

create index if not exists hotel_groups_status_cutoff_idx
  on public.hotel_groups(organization_id, property_id, status, cutoff_date);

commit;
