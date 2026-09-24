begin;

-- All current uploads-bucket writes are performed by scoped server APIs.
-- Keep public/authenticated reads for existing public media URLs, but remove
-- direct browser/anonymous object creation.
drop policy if exists "Public upload uploads bucket" on storage.objects;
drop policy if exists "Authenticated upload uploads bucket" on storage.objects;

commit;
