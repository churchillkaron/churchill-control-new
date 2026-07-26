begin;

-- The canonical e-invoicing workspace owns only the columns listed below.
-- Upgraded databases can retain additional predecessor columns from earlier
-- schemas. Preserve every legacy column and its existing data, but remove
-- NOT NULL requirements from non-canonical columns so canonical form writes
-- cannot be blocked by obsolete duplicate fields.
do $$
declare
  v_column record;
b