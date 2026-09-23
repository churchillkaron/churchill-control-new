create table if not exists public.supplier_invoice_submissions (
  id uuid primary key default gen_random_uuid(),
  supplier_account_id uuid not null references public.supplier_portal_accounts(id) on delete cascade,
  supplier_portal_access_id uuid not null references public.supplier_portal_access(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid references public.legal_entities(id) on delete set null,
  supplier_party_id uuid not null references public.parties(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  organization_document_id uuid references public.organization_documents(id) on delete set null,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  currency_code text not null default 'THB',
  total_amount numeric(18,4) not null check (total_amount > 0),
  supplier_note text,
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED','UNDER_REVIEW','ACCEPTED','REJECTED','CONVERTED')),
  canonical_vendor_invoice_id uuid references public.vendor_invoices(id) on delete set null,
  submitted_by_auth_user_id uuid references auth.users(id) on delete set null,
  reviewed_by_auth_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, supplier_party_id, invoice_number)
);

create index if not exists supplier_invoice_submissions_supplier_idx
  on public.supplier_invoice_submissions(supplier_account_id, status, created_at desc);
create index if not exists supplier_invoice_submissions_customer_idx
  on public.supplier_invoice_submissions(organization_id, status, created_at desc);
create index if not exists supplier_invoice_submissions_po_idx
  on public.supplier_invoice_submissions(purchase_order_id)
  where purchase_order_id is not null;

alter table public.supplier_invoice_submissions enable row level security;
revoke all on table public.supplier_invoice_submissions from anon, authenticated;
grant select, insert, update, delete on table public.supplier_invoice_submissions to service_role;

comment on table public.supplier_invoice_submissions is
  'External supplier invoice intake and review evidence. This table does not post accounting; accepted submissions are explicitly converted into canonical vendor_invoices by customer Finance.';
