begin;

alter table public.finance_review_signoffs
  add column if not exists cycle_no integer not null default 1,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid,
  add column if not exists revocation_reason text;

alter table public.finance_review_signoffs
  drop constraint if exists finance_review_signoffs_review_item_id_signoff_role_key;

drop index if exists public.finance_review_signoffs_active_role_uidx;
create unique index finance_review_signoffs_active_role_uidx
  on public.finance_review_signoffs (review_item_id, signoff_role)
  where revoked_at is null;

create index if not exists finance_review_signoffs_history_idx
  on public.finance_review_signoffs (
    organization_id,
    review_item_id,
    cycle_no desc,
    signed_at desc
  );

comment on column public.finance_review_signoffs.cycle_no is
  'Immutable accounting review cycle. A changes-requested rework starts a new cycle rather than overwriting prior evidence.';
comment on column public.finance_review_signoffs.revoked_at is
  'Timestamp at which a previously valid sign-off stopped being current because the work re-entered preparation/review.';

commit;
