-- Remove the legacy scalar compatibility overload because PostgREST cannot
-- disambiguate it from the canonical text[] RPC when JSON arrays are sent.
drop function if exists public.claim_avantiqo_local_compute_jobs(
  text,
  text,
  text,
  integer,
  integer
);

notify pgrst, 'reload schema';
