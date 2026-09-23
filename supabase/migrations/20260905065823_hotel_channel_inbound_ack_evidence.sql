begin;

do $$
begin
  -- Historical ordering: the canonical reservation-events table is created by
  -- 20260905143000. If an older environment already has it, upgrade it here;
  -- otherwise the creation migration below owns the final ACK columns.
  if to_regclass('public.hotel_channel_reservation_events') is null then
    return;
  end if;

  alter table public.hotel_channel_reservation_events
    add column if not exists provider_ack_status text not null default 'PENDING',
    add column if not exists provider_acknowledged_at timestamptz,
    add column if not exists provider_ack_error_code text,
    add column if not exists provider_ack_error_message text,
    add column if not exists provider_ack_detail jsonb not null default '{}'::jsonb;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.hotel_channel_reservation_events'::regclass
      and conname = 'hotel_channel_reservation_events_provider_ack_status_check'
  ) then
    alter table public.hotel_channel_reservation_events
      add constraint hotel_channel_reservation_events_provider_ack_status_check
      check (provider_ack_status in ('PENDING','ACKNOWLEDGED','SUPERSEDED','RETRY_REQUIRED'));
  end if;

  create index if not exists hotel_channel_reservation_events_ack_attention_idx
    on public.hotel_channel_reservation_events(
      organization_id,
      property_id,
      provider_ack_status,
      received_at desc
    );
end;
$$;

commit;
