alter table public.staff_phone_verification_challenges
  add column if not exists delivery_error_code text,
  add column if not exists delivery_error_message text;

comment on column public.staff_phone_verification_challenges.delivery_error_code
  is 'Provider delivery failure code from the WhatsApp/SMS delivery callback.';

comment on column public.staff_phone_verification_challenges.delivery_error_message
  is 'Provider delivery failure message from the WhatsApp/SMS delivery callback.';
