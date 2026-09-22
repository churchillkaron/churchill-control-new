create extension if not exists pgcrypto with schema extensions;

create table if not exists public.avantiqo_code_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  display_name text not null,
  platform text not null default 'unknown',
  token_hash text not null,
  enabled boolean not null default true,
  capabilities text[] not null default '{}',
  allowed_roots jsonb not null default '[]'::jsonb,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  paired_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_code_devices_name_check check (length(btrim(display_name)) between 1 and 160),
  constraint avantiqo_code_devices_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.avantiqo_code_device_pairings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  pairing_hash text not null unique,
  created_by uuid not null,
  requested_capabilities text[] not null default '{}',
  allowed_roots jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint avantiqo_code_device_pairing_hash_check check (pairing_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.avantiqo_code_device_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  device_id uuid not null references public.avantiqo_code_devices(id) on delete cascade,
  mission_id text,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'QUEUED',
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 2,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_code_device_jobs_status_check check (status in ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  constraint avantiqo_code_device_jobs_action_check check (length(btrim(action)) between 1 and 120),
  constraint avantiqo_code_device_jobs_attempts_check check (attempts >= 0 and max_attempts between 1 and 5)
);

create index if not exists avantiqo_code_devices_org_seen_idx on public.avantiqo_code_devices(organization_id,last_seen_at desc);
create index if not exists avantiqo_code_device_jobs_claim_idx on public.avantiqo_code_device_jobs(device_id,status,available_at,priority desc,created_at) where status in ('QUEUED','RUNNING');
create index if not exists avantiqo_code_device_jobs_org_idx on public.avantiqo_code_device_jobs(organization_id,created_at desc);

alter table public.avantiqo_code_devices enable row level security;
alter table public.avantiqo_code_device_pairings enable row level security;
alter table public.avantiqo_code_device_jobs enable row level security;
revoke all on table public.avantiqo_code_devices, public.avantiqo_code_device_pairings, public.avantiqo_code_device_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.avantiqo_code_devices, public.avantiqo_code_device_pairings, public.avantiqo_code_device_jobs to service_role;

create or replace function public.pair_avantiqo_code_device(
  p_pairing_code text,
  p_display_name text,
  p_platform text,
  p_capabilities text[] default '{}',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  v_pair public.avantiqo_code_device_pairings;
  v_token text := encode(extensions.gen_random_bytes(32),'hex');
  v_device public.avantiqo_code_devices;
begin
  select * into v_pair from public.avantiqo_code_device_pairings
  where pairing_hash=encode(extensions.digest(coalesce(p_pairing_code,''),'sha256'),'hex')
    and used_at is null and expires_at > now()
  for update;
  if v_pair.id is null then raise exception 'AVANTIQO_CODE_DEVICE_PAIRING_INVALID_OR_EXPIRED'; end if;
  insert into public.avantiqo_code_devices(organization_id,display_name,platform,token_hash,capabilities,allowed_roots,metadata,created_by)
  values(v_pair.organization_id,left(btrim(p_display_name),160),left(coalesce(nullif(btrim(p_platform),''),'unknown'),80),encode(extensions.digest(v_token,'sha256'),'hex'),coalesce(p_capabilities,v_pair.requested_capabilities),v_pair.allowed_roots,coalesce(p_metadata,'{}'::jsonb),v_pair.created_by)
  returning * into v_device;
  update public.avantiqo_code_device_pairings set used_at=now() where id=v_pair.id;
  return jsonb_build_object('device_id',v_device.id,'device_token',v_token,'organization_id',v_device.organization_id,'allowed_roots',v_device.allowed_roots);
end; $$;

create or replace function public.avantiqo_code_device_authorized(p_device_id uuid,p_device_token text)
returns boolean language sql stable security definer set search_path=public,extensions as $$
 select exists(select 1 from public.avantiqo_code_devices d where d.id=p_device_id and d.enabled=true and d.token_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex'));
$$;

create or replace function public.heartbeat_avantiqo_code_device(p_device_id uuid,p_device_token text,p_capabilities text[],p_metadata jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
begin
 if not public.avantiqo_code_device_authorized(p_device_id,p_device_token) then raise exception 'AVANTIQO_CODE_DEVICE_UNAUTHORIZED'; end if;
 update public.avantiqo_code_devices set last_seen_at=now(),updated_at=now(),capabilities=coalesce(p_capabilities,capabilities),metadata=coalesce(p_metadata,metadata) where id=p_device_id;
 return found;
end; $$;

create or replace function public.claim_avantiqo_code_device_jobs(p_device_id uuid,p_device_token text,p_limit integer default 1,p_lease_seconds integer default 120)
returns setof public.avantiqo_code_device_jobs language plpgsql security definer set search_path=public,extensions as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,1),2)); v_lease integer:=greatest(30,least(coalesce(p_lease_seconds,120),600));
begin
 if not public.avantiqo_code_device_authorized(p_device_id,p_device_token) then raise exception 'AVANTIQO_CODE_DEVICE_UNAUTHORIZED'; end if;
 update public.avantiqo_code_devices set last_seen_at=now(),updated_at=now() where id=p_device_id;
 return query with candidates as (
  select j.id from public.avantiqo_code_device_jobs j where j.device_id=p_device_id and ((j.status='QUEUED' and j.available_at<=now()) or (j.status='RUNNING' and j.leased_until<=now() and j.attempts<j.max_attempts)) order by j.priority desc,j.created_at asc for update skip locked limit v_limit
 ) update public.avantiqo_code_device_jobs j set status='RUNNING',attempts=j.attempts+1,started_at=coalesce(j.started_at,now()),leased_until=now()+make_interval(secs=>v_lease),updated_at=now(),error_code=null from candidates c where j.id=c.id returning j.*;
end; $$;

create or replace function public.complete_avantiqo_code_device_job(p_device_id uuid,p_device_token text,p_job_id uuid,p_result jsonb,p_metrics jsonb default '{}'::jsonb)
returns public.avantiqo_code_device_jobs language plpgsql security definer set search_path=public,extensions as $$
declare v_job public.avantiqo_code_device_jobs;
begin
 if not public.avantiqo_code_device_authorized(p_device_id,p_device_token) then raise exception 'AVANTIQO_CODE_DEVICE_UNAUTHORIZED'; end if;
 update public.avantiqo_code_device_jobs set status='COMPLETED',result=coalesce(p_result,'{}'::jsonb),metrics=coalesce(p_metrics,'{}'::jsonb),payload='{}'::jsonb,completed_at=now(),leased_until=null,error_code=null,updated_at=now() where id=p_job_id and device_id=p_device_id and status='RUNNING' returning * into v_job;
 if v_job.id is null then raise exception 'AVANTIQO_CODE_DEVICE_JOB_NOT_OWNED_OR_RUNNING'; end if; return v_job;
end; $$;

create or replace function public.fail_avantiqo_code_device_job(p_device_id uuid,p_device_token text,p_job_id uuid,p_error_code text,p_retryable boolean default true)
returns public.avantiqo_code_device_jobs language plpgsql security definer set search_path=public,extensions as $$
declare v_job public.avantiqo_code_device_jobs;
begin
 if not public.avantiqo_code_device_authorized(p_device_id,p_device_token) then raise exception 'AVANTIQO_CODE_DEVICE_UNAUTHORIZED'; end if;
 update public.avantiqo_code_device_jobs set status=case when p_retryable and attempts<max_attempts then 'QUEUED' else 'FAILED' end,available_at=case when p_retryable and attempts<max_attempts then now()+interval '3 seconds' else available_at end,payload=case when p_retryable and attempts<max_attempts then payload else '{}'::jsonb end,leased_until=null,completed_at=case when p_retryable and attempts<max_attempts then null else now() end,error_code=left(coalesce(nullif(btrim(p_error_code),''),'AVANTIQO_CODE_DEVICE_JOB_FAILED'),500),updated_at=now() where id=p_job_id and device_id=p_device_id and status='RUNNING' returning * into v_job;
 if v_job.id is null then raise exception 'AVANTIQO_CODE_DEVICE_JOB_NOT_OWNED_OR_RUNNING'; end if; return v_job;
end; $$;

revoke all on function public.pair_avantiqo_code_device(text,text,text,text[],jsonb), public.avantiqo_code_device_authorized(uuid,text), public.heartbeat_avantiqo_code_device(uuid,text,text[],jsonb), public.claim_avantiqo_code_device_jobs(uuid,text,integer,integer), public.complete_avantiqo_code_device_job(uuid,text,uuid,jsonb,jsonb), public.fail_avantiqo_code_device_job(uuid,text,uuid,text,boolean) from public;
grant execute on function public.pair_avantiqo_code_device(text,text,text,text[],jsonb), public.heartbeat_avantiqo_code_device(uuid,text,text[],jsonb), public.claim_avantiqo_code_device_jobs(uuid,text,integer,integer), public.complete_avantiqo_code_device_job(uuid,text,uuid,jsonb,jsonb), public.fail_avantiqo_code_device_job(uuid,text,uuid,text,boolean) to anon,authenticated,service_role;
