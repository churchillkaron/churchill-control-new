create table if not exists staff_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  staff_id uuid,
  title text,
  file_url text not null,
  file_type text,
  category text default 'staff',
  visibility text default 'private',
  created_at timestamptz default now()
);
