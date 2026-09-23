begin;
create index if not exists developer_api_credentials_environment_idx
  on public.developer_api_credentials (environment_id);
create index if not exists developer_api_requests_environment_idx
  on public.developer_api_requests (environment_id);
create index if not exists developer_webhook_endpoints_environment_idx
  on public.developer_webhook_endpoints (environment_id);
create index if not exists developer_webhook_deliveries_org_idx
  on public.developer_webhook_deliveries (organization_id, created_at desc);
commit;
