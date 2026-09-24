begin;

drop policy if exists "Allow uploads" on storage.objects;
drop policy if exists "Authenticated Upload" on storage.objects;

commit;
