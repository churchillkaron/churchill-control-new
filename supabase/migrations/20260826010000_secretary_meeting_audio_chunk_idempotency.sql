begin;

create table if not exists public.secretary_meeting_audio_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.secretary_meetings(id) on delete cascade,
  chunk_number integer not null check (chunk_number >= 1),
  status text not null default 'PROCESSING'
    check (status in ('PROCESSING','COMPLETED','FAILED')),
  started_offset_ms integer null check (started_offset_ms is null or started_offset_ms >= 0),
  mime_type text null,
  file_name text null,
  silent_chunk boolean not null default false,
  detected_language text null,
  segment_ids jsonb not null default '[]'::jsonb,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique (organization_id, meeting_id, chunk_number)
);

create index if not exists secretary_meeting_audio_chunks_meeting_idx
  on public.secretary_meeting_audio_chunks (organization_id, meeting_id, chunk_number);

alter table public.secretary_meeting_audio_chunks enable row level security;
revoke all on public.secretary_meeting_audio_chunks from anon, authenticated;
grant select, insert, update, delete on public.secretary_meeting_audio_chunks to service_role;

comment on table public.secretary_meeting_audio_chunks is
  'Exactly-once receipt ledger for transient Avantiqo Secretary meeting audio chunks. Raw audio bytes are never persisted here.';

comment on column public.secretary_meeting_audio_chunks.segment_ids is
  'Transcript segment identifiers created from this transient chunk; used to return idempotent replay results without retranscription.';

commit;
