alter table public.reputation_review_policies
  drop constraint if exists reputation_review_policies_rating_check;

alter table public.reputation_review_policies
  add constraint reputation_review_policies_rating_check
  check (
    auto_publish_min_rating between 1 and 5
    and approval_min_rating between 1 and 5
    and critical_max_rating between 1 and 5
  );

alter table public.reputation_review_policies
  alter column auto_publish_min_rating set default 1;

update public.reputation_review_policies as policy
set
  auto_publish_min_rating = 1,
  approval_min_rating = 1,
  updated_at = now()
from public.organizations as organization
where policy.organization_id = organization.id
  and lower(organization.name) = lower('Churchill Restaurant & Bar');
