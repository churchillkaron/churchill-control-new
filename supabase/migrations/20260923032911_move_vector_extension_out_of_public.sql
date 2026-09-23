begin;

create schema if not exists extensions;

alter extension vector set schema extensions;

create or replace function public.match_vector_memory(
  query_embedding extensions.vector,
  match_tenant_id uuid,
  match_count integer default 10
)
returns table(
  id uuid,
  tenant_id uuid,
  category text,
  text text,
  similarity double precision
)
language sql
set search_path = public, extensions, pg_temp
as $$
  select
    vm.id,
    vm.organization_id as tenant_id,
    vm.category,
    vm.text,
    1 - (vm.embedding_vector <=> query_embedding) as similarity
  from public.vector_memory vm
  where vm.organization_id = match_tenant_id
  order by vm.embedding_vector <=> query_embedding
  limit match_count;
$$;

notify pgrst, 'reload schema';

commit;
