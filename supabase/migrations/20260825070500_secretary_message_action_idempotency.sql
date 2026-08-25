begin;

create unique index if not exists secretary_follow_ups_message_reception_uidx
  on public.secretary_follow_ups ((metadata->>'secretary_reception_request_id'))
  where metadata ? 'secretary_reception_request_id';

create unique index if not exists secretary_tasks_message_reception_uidx
  on public.secretary_tasks ((metadata->>'secretary_reception_request_id'))
  where source = 'secretary_message'
    and metadata ? 'secretary_reception_request_id';

comment on index public.secretary_follow_ups_message_reception_uidx is
  'Prevents one inbound Secretary reception request from creating duplicate callback follow-ups during worker replay.';
comment on index public.secretary_tasks_message_reception_uidx is
  'Prevents one inbound Secretary reception request from creating duplicate leave-message tasks during worker replay.';

commit;
