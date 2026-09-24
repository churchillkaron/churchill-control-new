begin;

drop policy if exists "Authenticated can upload assets bucket" on storage.objects;
drop policy if exists "Authenticated can update assets bucket" on storage.objects;
drop policy if exists "Authenticated can delete assets bucket" on storage.objects;

commit;
