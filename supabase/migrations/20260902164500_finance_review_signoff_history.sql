begin;

alter table public.finance_review_signoffs
  add column if not exists cycle_no integer not null default 1,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid,
  add column if not exists revocation_reason text;

create index if not exists finance_review_signoffs_history_idx
  on public.finance_review_signoffs (
    organization_id,
    review_item_id,
    cycle_no desc,
    signed_at desc
  );

comment on column public.finance_review_signoffs.cycle_no is
  'Accounting review cycle marker reserved for immutable sign-off history. Existing API compatibility is retained until the versioned sign-off runtime is released.';
comment on column public.finance_review_signoffs.revoked_at is
  'Timestamp reserved for a future versioned sign-off lifecycle. Existing sign-off uniqueness remains authoritative until the runtime upgrade lands.';

commit;
