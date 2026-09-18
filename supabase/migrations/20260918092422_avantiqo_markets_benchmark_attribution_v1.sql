begin;

alter table public.market_portfolios
  add column if not exists benchmark_symbol text not null default 'SPY';

alter table public.market_portfolios drop constraint if exists market_portfolios_benchmark_symbol_check;
alter table public.market_portfolios add constraint market_portfolios_benchmark_symbol_check
  check (char_length(btrim(benchmark_symbol)) between 1 and 32);

create index if not exists market_prediction_outcomes_benchmark_idx
  on public.market_prediction_outcomes (
    organization_id,
    portfolio_id,
    evaluation_time desc
  )
  where benchmark_return is not null;

comment on column public.market_portfolios.benchmark_symbol is
  'Portfolio benchmark used for point-in-time excess-return attribution. Default SPY; owner-configurable.';
comment on column public.market_prediction_outcomes.benchmark_return is
  'Benchmark return measured over the same prediction interval as realized_return.';
comment on column public.market_prediction_outcomes.excess_return is
  'Realized return minus benchmark return over the same prediction interval.';

commit;
