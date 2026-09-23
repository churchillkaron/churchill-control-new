insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'supplier-finance-evidence',
  'supplier-finance-evidence',
  false,
  20971520,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.supplier_invoice_submissions is
  'External supplier invoice intake and review evidence. Evidence files are stored in the private supplier-finance-evidence bucket and exposed only through authorized short-lived signed URLs.';
