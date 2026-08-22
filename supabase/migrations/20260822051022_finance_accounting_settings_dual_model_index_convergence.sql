drop index if exists public.finance_accounting_settings_scope_uidx;

create unique index if not exists finance_accounting_settings_base_scope_uidx
on public.finance_accounting_settings (
  organization_id,
  coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
where setting_key is null;

create unique index if not exists finance_accounting_settings_policy_version_uidx
on public.finance_accounting_settings (
  organization_id,
  setting_key,
  effective_from
)
where setting_key is not null;