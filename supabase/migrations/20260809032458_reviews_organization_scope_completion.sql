alter table public.review_platform_profiles
  alter column organization_id set not null;

alter table public.reputation_reviews
  alter column organization_id set not null;

create unique index if not exists review_platform_profiles_org_platform_uidx
  on public.review_platform_profiles (organization_id, platform);

create unique index if not exists reputation_reviews_org_platform_external_uidx
  on public.reputation_reviews (organization_id, platform, external_review_id)
  where external_review_id is not null;
