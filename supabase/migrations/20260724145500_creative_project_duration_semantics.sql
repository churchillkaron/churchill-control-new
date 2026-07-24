begin;

-- Creative products do not all have a timeline duration.
-- VIDEO and AUDIO are temporal and require a positive duration.
-- IMAGE, DOCUMENT, MENU, WEBSITE, PRESENTATION, WEB_ASSET, and
-- MULTIMEDIA are non-temporal and must not carry an invented duration.

alter table if exists public.creative_projects
  alter column target_duration drop default,
  alter column target_duration drop not null;

update public.creative_projects
set target_duration = case
  when production_type in ('VIDEO', 'AUDIO') then
    case
      when target_duration is null or target_duration <= 0 then 30
      else target_duration
    end
  else null
end;

alter table if exists public.creative_projects
  drop constraint if exists creative_projects_target_duration_check;

alter table if exists public.creative_projects
  add constraint creative_projects_target_duration_check
  check (
    (
      production_type in ('VIDEO', 'AUDIO')
      and target_duration is not null
      and target_duration > 0
    )
    or
    (
      production_type not in ('VIDEO', 'AUDIO')
      and target_duration is null
    )
  );

comment on column public.creative_projects.target_duration is
  'Positive timeline duration for VIDEO and AUDIO projects; NULL for non-temporal creative products.';

notify pgrst, 'reload schema';

commit;
