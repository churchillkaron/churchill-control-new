select table_name
from information_schema.tables
where table_schema = 'public'
and (
table_name ilike '%hotel%'
or table_name ilike '%room%'
or table_name ilike '%booking%'
or table_name ilike '%reservation%'
or table_name ilike '%property%'
)
order by table_name;
