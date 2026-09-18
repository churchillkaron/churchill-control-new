create unique index if not exists subscriptions_one_canonical_per_lead_idx
on public.subscriptions (lead_id)
where lead_id is not null;

comment on index public.subscriptions_one_canonical_per_lead_idx is
'Guarantees one canonical commercial subscription per persisted acquisition lead.';
