create table if not exists public.hotel_shift_handover_context (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  source_key text not null,
  source_type text not null,
  source_id uuid,
  assigned_staff_account_id uuid references public.staff_accounts(id) on delete set null,
  note text,
  acknowledged_at timestamptz,
  acknowledged_by_staff_account_id uuid references public.staff_accounts(id) on delete set null,
  updated_by_staff_account_id uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_shift_handover_source_key_nonempty check (char_length(btrim(source_key)) between 3 and 300),
  constraint hotel_shift_handover_source_type_nonempty check (char_length(btrim(source_type)) between 2 and 80),
  constraint hotel_shift_handover_note_length check (note is null or char_length(note) <= 2000),
  unique (organization_id, property_id, source_key)
);

create index if not exists hotel_shift_handover_context_property_idx
  on public.hotel_shift_handover_context (organization_id, property_id, updated_at desc);

alter table public.hotel_shift_handover_context enable row level security;

create policy "hotel_shift_handover_context_org_read"
  on public.hotel_shift_handover_context
  for select
  using (
    exists (
      select 1
      from public.organization_users ou
      join public.staff_accounts sa on sa.id = ou.staff_account_id
      where ou.organization_id = hotel_shift_handover_context.organization_id
        and upper(coalesce(ou.status, 'ACTIVE')) = 'ACTIVE'
        and coalesce(sa.auth_user_id, sa.user_id) = auth.uid()
        and coalesce(sa.active, true) = true
    )
  );

comment on table public.hotel_shift_handover_context is
  'Human context for live Hotel operational exceptions. Source truth is derived from Hotel records; this table never determines whether an exception is resolved.';
