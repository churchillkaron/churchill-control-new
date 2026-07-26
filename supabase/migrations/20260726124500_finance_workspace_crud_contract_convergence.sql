begin;

-- The canonical Finance workspace contracts use the replacement columns below.
-- Older environments may still retain predecessor columns created by earlier
-- migrations. Preserve those columns and their existing data, but stop forcing
-- canonical writes to populate obsolete duplicate fields.
do $$
declare
  v_column record;
begin
  for v_column in
    select *
    from (
      values
        (
          'finance_revenue_recognition_s