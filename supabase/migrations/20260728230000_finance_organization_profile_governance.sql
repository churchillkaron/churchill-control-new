begin;

alter table public.finance_organization_profiles
  add column if not exists trading_name text,
  add column if not exists company_registration_number text,
  add column if not exists tax_registration_number text,
  add column if not exists registered_address_line1 text,
  add column if not exists registered_address_line2 text,
  add column if not exists city text,
  add column if not exists state_region text,
  add column if not exists postal_code text,
  add column if not exists locale text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website text;

update public.finance_organization_profiles
set
  legal_name = nullif(btrim(legal_name), ''),
  trading_name = nullif(btrim(trading_name), ''),
  company_registration_number = nullif(btrim(company_registration_number), ''),
  tax_registration_number = nullif(btrim(tax_registration_number), ''),
  registered_address_line1 = nullif(btrim(registered_address_line1), ''),
  registered_address_line2 = nullif(btrim(registered_address_line2), ''),
  city = nullif(btrim(city), ''),
  state_region = nullif(btrim(state_region), ''),
  postal_code = nullif(btrim(postal_code), ''),
  country_code = upper(nullif(btrim(country_code), '')),
  functional_currency = upper(nullif(btrim(functional_currency), '')),
  reporting_currency = upper(nullif(btrim(reporting_currency), '')),
  accounting_standard = nullif(btrim(accounting_standard), ''),
  timezone = nullif(btrim(timezone), ''),
  locale = nullif(btrim(locale), ''),
  contact_email = lower(nullif(btrim(contact_email), '')),
  contact_phone = nullif(btrim(contact_phone), ''),
  website = nullif(btrim(website), ''),
  updated_at = coalesce(updated_at, now());

alter table public.finance_organization_profiles
  drop constraint if exists finance_organization_profiles_country_code_check,
  drop constraint if exists finance_organization_profiles_functional_currency_check,
  drop constraint if exists finance_organization_profiles_reporting_currency_check,
  drop constraint if exists finance_organization_profiles_contact_email_check,
  drop constraint if exists finance_organization_profiles_website_check;

alter table public.finance_organization_profiles
  add constraint finance_organization_profiles_country_code_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add constraint finance_organization_profiles_functional_currency_check
    check (functional_currency is null or functional_currency ~ '^[A-Z0-9]{3,12}$'),
  add constraint finance_organization_profiles_reporting_currency_check
    check (reporting_currency is null or reporting_currency ~ '^[A-Z0-9]{3,12}$'),
  add constraint finance_organization_profiles_contact_email_check
    check (
      contact_email is null or
      contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),
  add constraint finance_organization_profiles_website_check
    check (
      website is null or
      website ~* '^https?://'
    );

create unique index if not exists finance_organization_profiles_organization_uidx
  on public.finance_organization_profiles (organization_id);

notify pgrst, 'reload schema';

commit;
