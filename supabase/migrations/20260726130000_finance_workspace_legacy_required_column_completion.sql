begin;

-- These predecessor columns remain in some upgraded databases from earlier
-- Finance workspace schemas. Canonical workspace forms now write the replacement
-- fields shown below. Preserve all legacy data and columns, but do not require
-- new canonical records to populate obsolete duplicate fields.
do $$
declare
  v_column record;
begin
  for v_column