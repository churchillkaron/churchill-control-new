create table if not exists public.staff_intake_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid null,
  enterprise_document_id uuid not null,
  uploader_staff_id uuid not null,
  destination_key text not null,
  destination_domain text not null,
  reviewer_role text not null,
  workflow text not null,
  confidence numeric(5,4) null,
  urgency text not null default 'NORMAL',
  requires_human_review boolean not null default true,
  suggested_action text null,
  rationale text null,
  universal_destination jsonb null,
  business_match jsonb null,
  handoff_status text not null default 'AWAITING_ROUTING_REVIEW',
  status text not null default 'PENDING_REVIEW',
  assigned_staff_id uuid null,
  reviewed_by_staff_id uuid null,
  reviewed_at timestamptz null,
  resolution_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_intake_assignments_status_check
    check (status in ('PENDING_REVIEW','ASSIGNED','ROUTING_APPROVED','REJECTED','COMPLETED','CANCELLED')),
  constraint staff_intake_assignments_urgency_check
    check (urgency in ('NORMAL','URGENT')),
  constraint staff_intake_assignments_handoff_status_check
    check (handoff_status in ('AWAITING_ROUTING_REVIEW','READY_FOR_DESTINATION_REVIEW','REJECTED','COMPLETED','CANCELLED')),
  constraint staff_intake_assignments_document_unique unique (organization_id, enterprise_document_id)
);

create index if not exists staff_intake_assignments_destination_idx
  on public.staff_intake_assignments (organization_id, destination_key, status, created_at desc);

create index if not exists staff_intake_assignments_reviewer_role_idx
  on public.staff_intake_assignments (organization_id, reviewer_role, status, created_at desc);

create index if not exists staff_intake_assignments_uploader_idx
  on public.staff_intake_assignments (organization_id, uploader_staff_id, created_at desc);

alter table public.staff_intake_assignments enable row level security;
revoke all on table public.staff_intake_assignments from anon, authenticated;

comment on table public.staff_intake_assignments is
  'Server-owned durable routing ledger for private Staff Portal camera/document intake. AI may classify and suggest routing but never mutates destination business records directly.';
