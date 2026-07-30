begin;

revoke all on function public.restaurant_settle_table_atomic(
  uuid,
  text,
  numeric,
  text,
  boolean,
  uuid[],
  text,
  uuid
) from public;

revoke all on function public.restaurant_settle_table_atomic(
  uuid,
  text,
  numeric,
  text,
  boolean,
  uuid[],
  text,
  uuid
) from anon;

revoke all on function public.restaurant_settle_table_atomic(
  uuid,
  text,
  numeric,
  text,
  boolean,
  uuid[],
  text,
  uuid
) from authenticated;

grant execute on function public.restaurant_settle_table_atomic(
  uuid,
  text,
  numeric,
  text,
  boolean,
  uuid[],
  text,
  uuid
) to service_role;

commit;
