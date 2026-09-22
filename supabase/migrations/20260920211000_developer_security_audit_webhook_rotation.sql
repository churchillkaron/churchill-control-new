begin;

create table if not exists public.developer_security_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid null,
  action text not null,
  target_type text not null,
  target_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists developer_security_audit_events_org_time_idx
  on public.developer_security_audit_events (organization_id, created_at desc);

alter table public.developer_security_audit_events enable row level security;
revoke all on table public.developer_security_audit_events from anon, authenticated;
grant select, insert, update, delete on table public.developer_security_audit_events to service_role;

create or replace function public.rotate_developer_webhook_secret(
  p_organization_id uuid,
  p_endpoint_id uuid,
  p_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_vault_id uuid;
begin
  if length(coalesce(p_secret,'')) < 32 then raise exception 'DEVELOPER_WEBHOOK_SECRET_TOO_SHORT'; end if;
  select secret_vault_id into v_vault_id
  from public.developer_webhook_endpoints
  where id = p_endpoint_id
    and organization_id = p_organization_id
    and status in ('ACTIVE','DISABLED')
  for update;
  if v_vault_id is null then raise exception 'DEVELOPER_WEBHOOK_SECRET_UNAVAILABLE'; end if;
  perform vault.update_secret(
    v_vault_id,
    p_secret,
    'developer-webhook:' || p_organization_id::text || ':' || p_endpoint_id::text,
    'Avantiqo developer webhook signing secret',
    null
  );
  update public.developer_webhook_endpoints set updated_at = now()
  where id = p_endpoint_id and organization_id = p_organization_id;
  return v_vault_id;
end;
$$;

revoke all on function public.rotate_developer_webhook_secret(uuid,uuid,text) from public;
revoke all on function public.rotate_developer_webhook_secret(uuid,uuid,text) from anon;
revoke all on function public.rotate_developer_webhook_secret(uuid,uuid,text) from authenticated;
grant execute on function public.rotate_developer_webhook_secret(uuid,uuid,text) to service_role;

commit;
