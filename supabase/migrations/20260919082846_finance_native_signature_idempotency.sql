begin;

create unique index if not exists document_signature_requests_native_active_slot_unique
  on public.document_signature_requests (
    organization_id,
    enterprise_document_id,
    version_number,
    signing_order
  )
  where provider = 'avantiqo_native_esign'
    and status in ('PENDING','SENT','VIEWED');

commit;
