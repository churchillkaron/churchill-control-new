create extension if not exists "pgcrypto";

create table if not exists public.message_threads (

  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null,

  created_by uuid,

  title text,

  type text default 'private',

  created_at timestamptz default now(),

  updated_at timestamptz default now()

);

create table if not exists public.message_participants (

  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null,

  thread_id uuid not null references public.message_threads(id) on delete cascade,

  staff_id uuid not null,

  created_at timestamptz default now()

);

create table if not exists public.messages (

  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null,

  thread_id uuid not null references public.message_threads(id) on delete cascade,

  sender_id uuid,

  content text,

  attachment_url text,

  created_at timestamptz default now()

);

create table if not exists public.message_reads (

  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null,

  message_id uuid not null references public.messages(id) on delete cascade,

  staff_id uuid not null,

  read_at timestamptz default now()

);

create index if not exists idx_messages_thread_id
on public.messages(thread_id);

create index if not exists idx_messages_created_at
on public.messages(created_at desc);

create index if not exists idx_message_participants_staff
on public.message_participants(staff_id);

create index if not exists idx_message_reads_message
on public.message_reads(message_id);

