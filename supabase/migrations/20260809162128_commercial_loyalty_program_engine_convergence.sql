create table if not exists public.commercial_loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE',
  earning_policy jsonb not null default '{}'::jsonb,
  redemption_policy jsonb not null default '{}'::jsonb,
  finance_policy jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_loyalty_programs_status_check check (status in ('DRAFT','ACTIVE','PAUSED','ARCHIVED')),
  constraint commercial_loyalty_programs_dates_check check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create unique index if not exists commercial_loyalty_programs_scope_code_uidx
  on public.commercial_loyalty_programs(
    organization_id,
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    upper(code)
  );
create index if not exists commercial_loyalty_programs_org_status_idx
  on public.commercial_loyalty_programs(organization_id,status,updated_at desc);

create table if not exists public.commercial_loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  program_id uuid not null references public.commercial_loyalty_programs(id) on delete cascade,
  code text not null,
  name text not null,
  rank integer not null default 0,
  min_points numeric,
  benefits jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_loyalty_tiers_status_check check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  constraint commercial_loyalty_tiers_min_points_check check (min_points is null or min_points >= 0)
);
create unique index if not exists commercial_loyalty_tiers_program_code_uidx
  on public.commercial_loyalty_tiers(program_id,upper(code));
create index if not exists commercial_loyalty_tiers_org_program_rank_idx
  on public.commercial_loyalty_tiers(organization_id,program_id,rank,min_points);

create table if not exists public.commercial_loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  program_id uuid not null references public.commercial_loyalty_programs(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  points_cost numeric not null,
  monetary_value numeric,
  currency_code text,
  finance_effect_type text,
  inventory_item_id uuid,
  status text not null default 'ACTIVE',
  starts_at timestamptz,
  ends_at timestamptz,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_loyalty_rewards_points_cost_check check (points_cost > 0),
  constraint commercial_loyalty_rewards_monetary_value_check check (monetary_value is null or monetary_value >= 0),
  constraint commercial_loyalty_rewards_status_check check (status in ('DRAFT','ACTIVE','PAUSED','ARCHIVED')),
  constraint commercial_loyalty_rewards_currency_check check (monetary_value is null or nullif(btrim(currency_code),'') is not null),
  constraint commercial_loyalty_rewards_dates_check check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create unique index if not exists commercial_loyalty_rewards_program_code_uidx
  on public.commercial_loyalty_rewards(program_id,upper(code));
create index if not exists commercial_loyalty_rewards_org_program_status_idx
  on public.commercial_loyalty_rewards(organization_id,program_id,status,updated_at desc);

alter table public.customer_loyalty_accounts
  alter column customer_name drop not null,
  alter column customer_phone drop not null,
  add column if not exists program_id uuid,
  add column if not exists tier_id uuid;

insert into public.commercial_loyalty_programs(
  organization_id,entity_id,code,name,status,earning_policy,redemption_policy,finance_policy
)
select distinct
  l.organization_id,
  null::uuid,
  'DEFAULT',
  'Default Loyalty Program',
  'ACTIVE',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb
from public.customer_loyalty_accounts l
where not exists (
  select 1
  from public.commercial_loyalty_programs p
  where p.organization_id=l.organization_id
    and p.entity_id is null
    and upper(p.code)='DEFAULT'
);

update public.customer_loyalty_accounts l
set program_id=p.id
from public.commercial_loyalty_programs p
where l.program_id is null
  and p.organization_id=l.organization_id
  and p.entity_id is null
  and upper(p.code)='DEFAULT';

insert into public.commercial_loyalty_tiers(
  organization_id,program_id,code,name,rank,min_points,status
)
select distinct
  l.organization_id,
  l.program_id,
  upper(regexp_replace(coalesce(nullif(btrim(l.tier),''),'UNASSIGNED'),'[^A-Za-z0-9]+','_','g')),
  coalesce(nullif(btrim(l.tier),''),'Unassigned'),
  0,
  null::numeric,
  'ACTIVE'
from public.customer_loyalty_accounts l
where l.program_id is not null
on conflict do nothing;

update public.customer_loyalty_accounts l
set tier_id=t.id
from public.commercial_loyalty_tiers t
where l.tier_id is null
  and t.program_id=l.program_id
  and upper(t.code)=upper(regexp_replace(coalesce(nullif(btrim(l.tier),''),'UNASSIGNED'),'[^A-Za-z0-9]+','_','g'));

alter table public.customer_loyalty_accounts
  alter column program_id set not null;

alter table public.customer_loyalty_accounts
  drop constraint if exists customer_loyalty_accounts_program_id_fkey,
  drop constraint if exists customer_loyalty_accounts_tier_id_fkey;
alter table public.customer_loyalty_accounts
  add constraint customer_loyalty_accounts_program_id_fkey foreign key (program_id)
    references public.commercial_loyalty_programs(id) on delete restrict,
  add constraint customer_loyalty_accounts_tier_id_fkey foreign key (tier_id)
    references public.commercial_loyalty_tiers(id) on delete set null;
create index if not exists customer_loyalty_accounts_program_idx
  on public.customer_loyalty_accounts(organization_id,program_id,tier_id,status);

create table if not exists public.commercial_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  program_id uuid not null references public.commercial_loyalty_programs(id) on delete restrict,
  loyalty_account_id uuid not null references public.customer_loyalty_accounts(id) on delete restrict,
  party_id uuid not null,
  entry_type text not null,
  points_delta numeric not null,
  balance_after numeric not null,
  source_domain text,
  source_document_type text,
  source_document_id uuid,
  source_event_id uuid,
  idempotency_key text not null,
  monetary_value numeric,
  currency_code text,
  metadata jsonb not null default '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz not null default now(),
  reversed_entry_id uuid references public.commercial_loyalty_ledger(id) on delete restrict,
  constraint commercial_loyalty_ledger_entry_type_check check (entry_type in ('OPENING_BALANCE','EARN','REDEEM','ADJUST','EXPIRE','REVERSAL')),
  constraint commercial_loyalty_ledger_balance_check check (balance_after >= 0),
  constraint commercial_loyalty_ledger_delta_check check (points_delta <> 0 or entry_type='OPENING_BALANCE'),
  constraint commercial_loyalty_ledger_currency_check check (monetary_value is null or nullif(btrim(currency_code),'') is not null)
);
create unique index if not exists commercial_loyalty_ledger_idempotency_uidx
  on public.commercial_loyalty_ledger(organization_id,program_id,idempotency_key);
create index if not exists commercial_loyalty_ledger_account_created_idx
  on public.commercial_loyalty_ledger(organization_id,loyalty_account_id,created_at desc);
create index if not exists commercial_loyalty_ledger_party_created_idx
  on public.commercial_loyalty_ledger(organization_id,party_id,created_at desc);
create index if not exists commercial_loyalty_ledger_source_idx
  on public.commercial_loyalty_ledger(organization_id,source_domain,source_document_type,source_document_id);

insert into public.commercial_loyalty_ledger(
  organization_id,entity_id,program_id,loyalty_account_id,party_id,
  entry_type,points_delta,balance_after,idempotency_key,metadata,created_at
)
select
  l.organization_id,l.entity_id,l.program_id,l.id,l.party_id,
  'OPENING_BALANCE',coalesce(l.loyalty_points,0),coalesce(l.loyalty_points,0),
  'migration-opening:'||l.id::text,
  jsonb_build_object('source','customer_loyalty_accounts','migrated_tier',l.tier),
  coalesce(l.created_at,now())
from public.customer_loyalty_accounts l
where not exists (
  select 1 from public.commercial_loyalty_ledger e
  where e.organization_id=l.organization_id
    and e.program_id=l.program_id
    and e.idempotency_key='migration-opening:'||l.id::text
);

create table if not exists public.commercial_loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  program_id uuid not null references public.commercial_loyalty_programs(id) on delete restrict,
  reward_id uuid not null references public.commercial_loyalty_rewards(id) on delete restrict,
  loyalty_account_id uuid not null references public.customer_loyalty_accounts(id) on delete restrict,
  party_id uuid not null,
  ledger_entry_id uuid not null references public.commercial_loyalty_ledger(id) on delete restrict,
  points_spent numeric not null,
  monetary_value numeric,
  currency_code text,
  status text not null default 'COMPLETED',
  finance_effect_status text not null default 'NOT_REQUIRED',
  finance_event_id uuid,
  idempotency_key text not null,
  redeemed_by uuid,
  redeemed_at timestamptz not null default now(),
  reversed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint commercial_loyalty_redemptions_points_check check (points_spent > 0),
  constraint commercial_loyalty_redemptions_status_check check (status in ('COMPLETED','REVERSED')),
  constraint commercial_loyalty_redemptions_finance_status_check check (finance_effect_status in ('NOT_REQUIRED','PENDING','EMITTED','FAILED'))
);
create unique index if not exists commercial_loyalty_redemptions_idempotency_uidx
  on public.commercial_loyalty_redemptions(organization_id,program_id,idempotency_key);
create index if not exists commercial_loyalty_redemptions_party_idx
  on public.commercial_loyalty_redemptions(organization_id,party_id,redeemed_at desc);

alter table public.commercial_loyalty_programs enable row level security;
alter table public.commercial_loyalty_tiers enable row level security;
alter table public.commercial_loyalty_rewards enable row level security;
alter table public.commercial_loyalty_ledger enable row level security;
alter table public.commercial_loyalty_redemptions enable row level security;

revoke all on public.commercial_loyalty_programs from anon,authenticated;
revoke all on public.commercial_loyalty_tiers from anon,authenticated;
revoke all on public.commercial_loyalty_rewards from anon,authenticated;
revoke all on public.commercial_loyalty_ledger from anon,authenticated;
revoke all on public.commercial_loyalty_redemptions from anon,authenticated;
grant select,insert,update,delete on public.commercial_loyalty_programs to service_role;
grant select,insert,update,delete on public.commercial_loyalty_tiers to service_role;
grant select,insert,update,delete on public.commercial_loyalty_rewards to service_role;
grant select,insert on public.commercial_loyalty_ledger to service_role;
grant select,insert,update on public.commercial_loyalty_redemptions to service_role;

create or replace function public.commercial_loyalty_enroll_party_idempotent(
  p_organization_id uuid,
  p_party_id uuid,
  p_program_id uuid,
  p_entity_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_party public.parties%rowtype;
  v_program public.commercial_loyalty_programs%rowtype;
  v_account public.customer_loyalty_accounts%rowtype;
  v_existing public.commercial_loyalty_ledger%rowtype;
begin
  if p_organization_id is null or p_party_id is null or p_program_id is null then
    raise exception 'organization_id, party_id and program_id required';
  end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'idempotency_key required'; end if;

  select * into v_party from public.parties
  where organization_id=p_organization_id and id=p_party_id;
  if not found then raise exception 'Party not found in organization'; end if;

  if not exists (
    select 1 from public.party_relationships r
    where r.organization_id=p_organization_id and r.party_id=p_party_id
      and lower(r.relationship_type)='customer'
      and lower(coalesce(r.status,'active')) <> 'archived'
  ) then raise exception 'Party is not an active customer'; end if;

  select * into v_program from public.commercial_loyalty_programs
  where id=p_program_id and organization_id=p_organization_id and status='ACTIVE'
    and (entity_id is null or entity_id=p_entity_id);
  if not found then raise exception 'Active loyalty program not found in scope'; end if;

  select * into v_account from public.customer_loyalty_accounts
  where organization_id=p_organization_id and party_id=p_party_id
  for update;
  if found then
    if v_account.program_id <> p_program_id then
      raise exception 'Customer is already enrolled in a different loyalty program';
    end if;
    return jsonb_build_object('success',true,'duplicate',true,'account_id',v_account.id,'party_id',p_party_id,'program_id',p_program_id,'balance',coalesce(v_account.loyalty_points,0));
  end if;

  insert into public.customer_loyalty_accounts(
    organization_id,entity_id,party_id,program_id,customer_name,customer_phone,customer_email,
    loyalty_points,tier,status,created_at,updated_at
  ) values (
    p_organization_id,p_entity_id,p_party_id,p_program_id,
    coalesce(v_party.display_name,v_party.legal_name),v_party.phone,v_party.email,
    0,null,'ACTIVE',now(),now()
  ) returning * into v_account;

  insert into public.commercial_loyalty_ledger(
    organization_id,entity_id,program_id,loyalty_account_id,party_id,
    entry_type,points_delta,balance_after,idempotency_key,metadata,performed_by
  ) values (
    p_organization_id,p_entity_id,p_program_id,v_account.id,p_party_id,
    'OPENING_BALANCE',0,0,btrim(p_idempotency_key),jsonb_build_object('source','enrollment'),p_actor_id
  ) returning * into v_existing;

  return jsonb_build_object('success',true,'duplicate',false,'account_id',v_account.id,'party_id',p_party_id,'program_id',p_program_id,'balance',0);
end;
$$;

create or replace function public.commercial_loyalty_apply_points_idempotent(
  p_organization_id uuid,
  p_party_id uuid,
  p_points_delta numeric,
  p_entry_type text,
  p_source_domain text,
  p_source_document_type text,
  p_source_document_id uuid,
  p_source_event_id uuid,
  p_monetary_value numeric,
  p_currency_code text,
  p_metadata jsonb,
  p_actor_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_account public.customer_loyalty_accounts%rowtype;
  v_existing public.commercial_loyalty_ledger%rowtype;
  v_entry public.commercial_loyalty_ledger%rowtype;
  v_type text;
  v_balance numeric;
  v_tier public.commercial_loyalty_tiers%rowtype;
begin
  if p_organization_id is null or p_party_id is null then raise exception 'organization_id and party_id required'; end if;
  if p_points_delta is null or p_points_delta=0 then raise exception 'Non-zero points_delta required'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'idempotency_key required'; end if;
  v_type := upper(nullif(btrim(p_entry_type),''));
  if v_type not in ('EARN','REDEEM','ADJUST','EXPIRE','REVERSAL') then raise exception 'Invalid loyalty entry type'; end if;
  if v_type='EARN' and p_points_delta <= 0 then raise exception 'EARN requires positive points'; end if;
  if v_type in ('REDEEM','EXPIRE') and p_points_delta >= 0 then raise exception '% requires negative points',v_type; end if;

  select * into v_account from public.customer_loyalty_accounts
  where organization_id=p_organization_id and party_id=p_party_id
  for update;
  if not found then raise exception 'Loyalty account not found for Party'; end if;
  if upper(coalesce(v_account.status,'ACTIVE')) <> 'ACTIVE' then raise exception 'Loyalty account is not active'; end if;

  select * into v_existing from public.commercial_loyalty_ledger
  where organization_id=p_organization_id and program_id=v_account.program_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    return jsonb_build_object('success',true,'duplicate',true,'ledger_entry_id',v_existing.id,'account_id',v_account.id,'party_id',p_party_id,'balance',v_existing.balance_after);
  end if;

  v_balance := round(coalesce(v_account.loyalty_points,0)+p_points_delta,4);
  if v_balance < 0 then raise exception 'Insufficient loyalty points'; end if;

  select * into v_tier
  from public.commercial_loyalty_tiers t
  where t.organization_id=p_organization_id
    and t.program_id=v_account.program_id
    and t.status='ACTIVE'
    and t.min_points is not null
    and t.min_points <= v_balance
  order by t.min_points desc,t.rank desc,t.id
  limit 1;

  update public.customer_loyalty_accounts
  set loyalty_points=v_balance,
      tier_id=coalesce(v_tier.id,tier_id),
      tier=case when v_tier.id is not null then v_tier.name else tier end,
      updated_at=now()
  where id=v_account.id;

  insert into public.commercial_loyalty_ledger(
    organization_id,entity_id,program_id,loyalty_account_id,party_id,entry_type,
    points_delta,balance_after,source_domain,source_document_type,source_document_id,source_event_id,
    idempotency_key,monetary_value,currency_code,metadata,performed_by
  ) values (
    p_organization_id,v_account.entity_id,v_account.program_id,v_account.id,p_party_id,v_type,
    p_points_delta,v_balance,nullif(btrim(p_source_domain),''),nullif(btrim(p_source_document_type),''),p_source_document_id,p_source_event_id,
    btrim(p_idempotency_key),p_monetary_value,upper(nullif(btrim(p_currency_code),'')),coalesce(p_metadata,'{}'::jsonb),p_actor_id
  ) returning * into v_entry;

  return jsonb_build_object('success',true,'duplicate',false,'ledger_entry_id',v_entry.id,'account_id',v_account.id,'party_id',p_party_id,'program_id',v_account.program_id,'points_delta',p_points_delta,'balance',v_balance,'tier_id',coalesce(v_tier.id,v_account.tier_id));
end;
$$;

create or replace function public.commercial_loyalty_redeem_reward_idempotent(
  p_redemption_id uuid,
  p_organization_id uuid,
  p_party_id uuid,
  p_reward_id uuid,
  p_actor_id uuid,
  p_source_document_type text,
  p_source_document_id uuid,
  p_metadata jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reward public.commercial_loyalty_rewards%rowtype;
  v_account public.customer_loyalty_accounts%rowtype;
  v_existing public.commercial_loyalty_redemptions%rowtype;
  v_points_result jsonb;
  v_ledger_id uuid;
  v_finance_status text := 'NOT_REQUIRED';
  v_event jsonb;
  v_event_id uuid;
begin
  if p_redemption_id is null or p_organization_id is null or p_party_id is null or p_reward_id is null then
    raise exception 'redemption_id, organization_id, party_id and reward_id required';
  end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'idempotency_key required'; end if;

  select * into v_existing from public.commercial_loyalty_redemptions
  where organization_id=p_organization_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    return jsonb_build_object('success',true,'duplicate',true,'redemption_id',v_existing.id,'party_id',p_party_id,'points_spent',v_existing.points_spent,'finance_effect_status',v_existing.finance_effect_status);
  end if;

  select * into v_account from public.customer_loyalty_accounts
  where organization_id=p_organization_id and party_id=p_party_id
  for update;
  if not found then raise exception 'Loyalty account not found for Party'; end if;

  select * into v_reward from public.commercial_loyalty_rewards
  where id=p_reward_id and organization_id=p_organization_id and program_id=v_account.program_id
    and status='ACTIVE'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now());
  if not found then raise exception 'Active loyalty reward not found in customer program'; end if;

  v_points_result := public.commercial_loyalty_apply_points_idempotent(
    p_organization_id,p_party_id,-v_reward.points_cost,'REDEEM','COMMERCIAL','LOYALTY_REWARD',p_reward_id,null,
    v_reward.monetary_value,v_reward.currency_code,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('reward_id',v_reward.id,'reward_code',v_reward.code),
    p_actor_id,btrim(p_idempotency_key)||':points'
  );
  v_ledger_id := (v_points_result->>'ledger_entry_id')::uuid;

  if v_reward.monetary_value is not null and v_reward.monetary_value > 0 then
    v_finance_status := 'PENDING';
  end if;

  insert into public.commercial_loyalty_redemptions(
    id,organization_id,entity_id,program_id,reward_id,loyalty_account_id,party_id,ledger_entry_id,
    points_spent,monetary_value,currency_code,status,finance_effect_status,idempotency_key,redeemed_by,metadata
  ) values (
    p_redemption_id,p_organization_id,v_account.entity_id,v_account.program_id,v_reward.id,v_account.id,p_party_id,v_ledger_id,
    v_reward.points_cost,v_reward.monetary_value,upper(v_reward.currency_code),'COMPLETED',v_finance_status,btrim(p_idempotency_key),p_actor_id,coalesce(p_metadata,'{}'::jsonb)
  );

  if v_finance_status='PENDING' then
    v_event := public.record_system_event_atomic(
      p_organization_id,
      'commercial.loyalty.reward_redeemed',
      jsonb_build_object(
        'organization_id',p_organization_id,
        'entity_id',v_account.entity_id,
        'party_id',p_party_id,
        'program_id',v_account.program_id,
        'redemption_id',p_redemption_id,
        'reward_id',v_reward.id,
        'points_spent',v_reward.points_cost,
        'monetary_value',v_reward.monetary_value,
        'currency_code',upper(v_reward.currency_code),
        'finance_effect_type',v_reward.finance_effect_type,
        'source_document_type',nullif(btrim(p_source_document_type),''),
        'source_document_id',p_source_document_id
      ),
      'loyalty-redemption-finance:'||p_redemption_id::text
    );
    v_event_id := nullif(v_event#>>'{event,id}','')::uuid;
    update public.commercial_loyalty_redemptions
    set finance_effect_status='EMITTED',finance_event_id=v_event_id
    where id=p_redemption_id;
    v_finance_status := 'EMITTED';
  end if;

  return jsonb_build_object('success',true,'duplicate',false,'redemption_id',p_redemption_id,'party_id',p_party_id,'reward_id',v_reward.id,'points_spent',v_reward.points_cost,'balance',v_points_result->'balance','finance_effect_status',v_finance_status,'finance_event_id',v_event_id);
end;
$$;

revoke all on function public.commercial_loyalty_enroll_party_idempotent(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.commercial_loyalty_apply_points_idempotent(uuid,uuid,numeric,text,text,text,uuid,uuid,numeric,text,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.commercial_loyalty_redeem_reward_idempotent(uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.commercial_loyalty_enroll_party_idempotent(uuid,uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.commercial_loyalty_apply_points_idempotent(uuid,uuid,numeric,text,text,text,uuid,uuid,numeric,text,jsonb,uuid,text) to service_role;
grant execute on function public.commercial_loyalty_redeem_reward_idempotent(uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,text) to service_role;
