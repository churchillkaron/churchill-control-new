begin;
create index if not exists developer_api_idempotency_credential_idx
  on public.developer_api_idempotency (credential_id)
  where credential_id is not null;
create index if not exists developer_api_idempotency_environment_idx
  on public.developer_api_idempotency (environment_id);
create index if not exists developer_api_monthly_usage_environment_idx
  on public.developer_api_monthly_usage (environment_id);
create index if not exists developer_environment_rate_buckets_environment_idx
  on public.developer_environment_rate_buckets (environment_id);
commit;
