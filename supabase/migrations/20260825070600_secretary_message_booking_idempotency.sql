begin;

create unique index if not exists secretary_calendar_events_message_reception_uidx
  on public.secretary_calendar_events ((metadata->>'secretary_reception_request_id'))
  where source = 'secretary_message'
    and metadata ? 'secretary_reception_request_id';

comment on index public.secretary_calendar_events_message_reception_uidx is
  'Prevents one inbound Secretary reception request from creating more than one appointment during worker replay.';

commit;
