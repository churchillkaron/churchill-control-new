begin;

alter table public.market_risk_policies
  add column if not exists max_market_data_age_seconds integer not null default 120,
  add column if not exists max_spread_bps numeric(10,4) not null default 50,
  add column if not exists min_quote_notional numeric(20,4) not null default 0;

alter table public.market_risk_policies drop constraint if exists market_risk_market_data_age_check;
alter table public.market_risk_policies add constraint market_risk_market_data_age_check
  check (max_market_data_age_seconds between 1 and 3600);

alter table public.market_risk_policies drop constraint if exists market_risk_spread_check;
alter table public.market_risk_policies add constraint market_risk_spread_check
  check (max_spread_bps > 0 and max_spread_bps <= 10000);

alter table public.market_risk_policies drop constraint if exists market_risk_quote_notional_check;
alter table public.market_risk_policies add constraint market_risk_quote_notional_check
  check (min_quote_notional >= 0);

comment on column public.market_risk_policies.max_market_data_age_seconds is
  'Maximum accepted age of the authoritative quote/trade snapshot before a PAPER order fails closed.';
comment on column public.market_risk_policies.max_spread_bps is
  'Maximum accepted bid-ask spread in basis points for new PAPER exposure.';
comment on column public.market_risk_policies.min_quote_notional is
  'Minimum displayed same-side quote notional required for new PAPER exposure. Zero disables this check.';

commit;
