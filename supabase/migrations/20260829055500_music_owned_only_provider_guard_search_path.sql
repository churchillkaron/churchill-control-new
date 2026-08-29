-- Harden the Music owned-only trigger function against caller-controlled search_path.
alter function public.enforce_avantiqo_music_owned_provider_pricing()
set search_path = '';
