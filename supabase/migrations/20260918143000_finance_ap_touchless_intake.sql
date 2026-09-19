begin;

create table if not exists public.finance_ap_intake_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  attachment_set_id uuid,
  logical_object_id text,
  enterprise_document_id uuid references public.enterprise_documents(id) on delete set null,
  source_sha256 text,
  source_file_name text,
  source_mime_type text,
  business_match_status text,
  preparation_status text not null default 'UPLOADED'
    check (preparation_status in ('UPLOADED','ANALYZED','CLARIFICATION_REQUIRED','READY_FOR_REVIEW','READY_FOR_CREATE_AND_MATCH','CREATING','CREATED','DUPLICATE','FAILED')),
  touchless_stage text,
  vendor_party_id uuid references public.parties(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  goods_receipt_id uuid references public.goods_receipts(id) on delete set null,
  vendor_invoice_id uuid references public.vendor_invoices(id) on delete set null,
  invoice_number text,
  invoice_date date,
  currency_code text,
  ocr_confidence numeric(9,6),
  clarification_question text,
  preparation_evidence jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_by uuid references public.staff_accounts(id) on delete set null,
  confirmed_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (organization_id, entity_id, source_sha256, logical_object_id)
);

create index if not exists finance_ap_intake_items_queue_idx
  on public.finance_ap_intake_items (organization_id, entity_id, preparation_status, created_at desc);
create index if not exists finance_ap_intake_items_vendor_invoice_idx
  on public.finance_ap_intake_items (organization_id, vendor_invoice_id)
  where vendor_invoice_id is not null;

alter table public.finance_ap_intake_items enable row level security;
revoke all on table public.finance_ap_intake_items from anon, authenticated;
grant select, insert, update, delete on table public.finance_ap_intake_items to service_role;

comment on table public.finance_ap_intake_items is
  'Durable touchless-AP intake queue binding original supplier-invoice evidence to deterministic preparation, procurement matching and canonical vendor invoice creation. Intake never grants approval, posting or payment authority.';

notify pgrst, 'reload schema';
commit;
