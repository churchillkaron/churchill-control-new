begin;

with ranked as (
  select
    id,
    row_number() over (
      partition by template_id, module_id
      order by required desc, sort_order asc nulls last, created_at asc, id asc
    ) as row_number
  from public.workspace_template_modules
)
delete from public.workspace_template_modules target
using ranked
where target.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists workspace_template_modules_template_module_unique
  on public.workspace_template_modules (template_id, module_id);

comment on index public.workspace_template_modules_template_module_unique is
  'A solution template may declare each platform module only once.';

commit;
