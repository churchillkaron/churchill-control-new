begin;

alter table public.market_bars
  add column if not exists provenance jsonb not null default '{}'::jsonb;

comment on column public.market_bars.provenance is
  'Durable source/request provenance for historical market bars, including provider feed, timeframe and corporate-action adjustment mode when supplied.';

commit;
