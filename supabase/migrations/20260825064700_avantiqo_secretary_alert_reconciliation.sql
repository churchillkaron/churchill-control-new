begin;

create or replace function public.secretary_reconcile_stale_alerts(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tasks integer := 0;
  v_follow_ups integer := 0;
  v_events integer := 0;
begin
  update public.secretary_alerts a
  set status = 'RESOLVED',
      resolved_at = coalesce(a.resolved_at, p_now),
      updated_at = p_now,
      metadata = a.metadata || jsonb_build_object('auto_resolved_reason', 'SOURCE_TASK_NO_LONGER_DUE')
  where a.alert_kind = 'TASK'
    and a.status in ('PENDING','SEEN')
    and not exists (
      select 1
      from public.secretary_tasks t
      where t.organization_id = a.organization_id
        and t.id = a.source_id
        and t.status in ('OPEN','IN_PROGRESS')
        and coalesce(t.remind_at, t.due_at) is not null
        and a.dedupe_key = 'task:' || t.id::text || ':' || coalesce(t.remind_at, t.due_at)::text
    );
  get diagnostics v_tasks = row_count;

  update public.secretary_alerts a
  set status = 'RESOLVED',
      resolved_at = coalesce(a.resolved_at, p_now),
      updated_at = p_now,
      metadata = a.metadata || jsonb_build_object('auto_resolved_reason', 'SOURCE_FOLLOW_UP_NO_LONGER_PENDING')
  where a.alert_kind = 'FOLLOW_UP'
    and a.status in ('PENDING','SEEN')
    and not exists (
      select 1
      from public.secretary_follow_ups f
      where f.organization_id = a.organization_id
        and f.id = a.source_id
        and f.status = 'PENDING'
        and a.dedupe_key = 'follow_up:' || f.id::text || ':' || f.due_at::text
    );
  get diagnostics v_follow_ups = row_count;

  update public.secretary_alerts a
  set status = 'RESOLVED',
      resolved_at = coalesce(a.resolved_at, p_now),
      updated_at = p_now,
      metadata = a.metadata || jsonb_build_object('auto_resolved_reason', 'SOURCE_EVENT_NO_LONGER_UPCOMING')
  where a.alert_kind = 'CALENDAR_EVENT'
    and a.status in ('PENDING','SEEN')
    and not exists (
      select 1
      from public.secretary_calendar_events e
      where e.organization_id = a.organization_id
        and e.id = a.source_id
        and e.status in ('TENTATIVE','CONFIRMED')
        and e.ends_at > p_now
        and a.dedupe_key = 'calendar:' || e.id::text || ':' || e.starts_at::text
    );
  get diagnostics v_events = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'resolved', jsonb_build_object(
      'tasks', v_tasks,
      'follow_ups', v_follow_ups,
      'calendar_events', v_events,
      'total', v_tasks + v_follow_ups + v_events
    ),
    'external_authority_used', false
  );
end;
$$;

revoke all on function public.secretary_reconcile_stale_alerts(timestamptz)
  from public, anon, authenticated;
grant execute on function public.secretary_reconcile_stale_alerts(timestamptz)
  to service_role;

comment on function public.secretary_reconcile_stale_alerts(timestamptz) is
  'Automatically resolves Secretary alerts whose native task, follow-up, or calendar source is completed, cancelled, rescheduled, or otherwise no longer current.';

commit;
